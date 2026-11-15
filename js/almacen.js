// Guardado local. Los datos nunca salen del dispositivo.
import { fijosValidos } from './fijos.js';

export function cuentasPorDefecto() {
  return ['Efectivo', 'BNB', 'Altoke'].map((nombre, orden) => ({
    id: nombre.toLowerCase(), nombre, saldoInicial: 0, orden, archivada: false,
  }));
}

export const CATEGORIAS = ['Comida', 'Pasaje', 'Gasolina', 'Moto', 'Parqueo', 'Megas', 'Salida', 'Motel/Hotel', 'Gimnasio', 'Proyectos', 'Otro'];
const RENOMBRADAS = new Map([['Hotel', 'Motel/Hotel']]);

/**
 * Pone al día datos guardados con una lista de categorías anterior:
 * renombra las que cambiaron (también en los movimientos) y añade las
 * nuevas antes de "Otro". Aplicarla dos veces no cambia nada.
 */
export function ponerAlDia(datos) {
  const nombre = (c) => RENOMBRADAS.get(c) ?? c;
  const categorias = [...new Set(datos.ajustes.categorias.map(nombre))];
  for (const c of CATEGORIAS) {
    if (categorias.includes(c)) continue;
    const otro = categorias.indexOf('Otro');
    categorias.splice(otro === -1 ? categorias.length : otro, 0, c);
  }
  return {
    ...datos,
    ajustes: { ...datos.ajustes, categorias, fijos: fijosValidos(datos.ajustes.fijos) },
    movimientos: datos.movimientos.map((m) => (RENOMBRADAS.has(m.categoria) ? { ...m, categoria: nombre(m.categoria) } : m)),
  };
}

export function ajustesPorDefecto() {
  return {
    diaMensualidad: 1,
    categorias: [...CATEGORIAS],
    origenes: ['Mensualidad', 'Delivery', 'Arreglo', 'Código', 'Otro'],
    fijos: [],           // pagos que se repiten: { id, nombre, estimado, dia (1–28 o null) }
    ultimaCuentaId: null,
    inicio: null,        // día en que empezó a usar la app, "2026-11-14"
    configurada: false,
  };
}

/** La app como recién instalada: sin movimientos, saldos en cero, sin configurar. */
export function datosVacios() {
  return { cuentas: cuentasPorDefecto(), movimientos: [], ajustes: ajustesPorDefecto() };
}

const copia = (x) => structuredClone(x);

/** Doble en memoria con la misma interfaz que el almacén real. Para pruebas. */
export function crearAlmacenMemoria() {
  let cuentas = null;
  let ajustes = null;
  let movimientos = new Map();
  return {
    async cargar() {
      return ponerAlDia({
        cuentas: copia(cuentas ?? cuentasPorDefecto()),
        movimientos: copia([...movimientos.values()]),
        ajustes: copia(ajustes ?? ajustesPorDefecto()),
      });
    },
    async guardarCuentas(nuevas) { cuentas = copia(nuevas); },
    async guardarAjustes(nuevos) { ajustes = copia(nuevos); },
    async actualizarAjustes(cambio) { ajustes = copia(cambio(copia(ajustes ?? ajustesPorDefecto()))); },
    async agregarMovimiento(mov) { movimientos.set(mov.id, copia(mov)); },
    async borrarMovimiento(id) { movimientos.delete(id); },
    async reemplazarTodo(datos) {
      cuentas = copia(datos.cuentas);
      ajustes = copia(datos.ajustes);
      movimientos = new Map(datos.movimientos.map((m) => [m.id, copia(m)]));
    },
  };
}

const NOMBRE = 'marea';
const VERSION = 1;

function pedir(solicitud) {
  return new Promise((ok, mal) => {
    solicitud.onsuccess = () => ok(solicitud.result);
    solicitud.onerror = () => mal(solicitud.error);
  });
}

function terminar(tx) {
  return new Promise((ok, mal) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

function conectar() {
  const apertura = indexedDB.open(NOMBRE, VERSION);
  apertura.onupgradeneeded = () => {
    const bd = apertura.result;
    if (!bd.objectStoreNames.contains('cuentas')) bd.createObjectStore('cuentas', { keyPath: 'id' });
    if (!bd.objectStoreNames.contains('movimientos')) bd.createObjectStore('movimientos', { keyPath: 'id' });
    if (!bd.objectStoreNames.contains('ajustes')) bd.createObjectStore('ajustes');
  };
  return pedir(apertura);
}

/** Almacén real sobre IndexedDB. */
export async function abrirAlmacen() {
  let bd = await conectar();
  const vigilar = () => {
    // El teléfono puede cerrar la conexión si la app pasa mucho en segundo plano.
    bd.onclose = () => { bd = null; };
    bd.onversionchange = () => { bd.close(); bd = null; };
  };
  vigilar();

  /** Abre una transacción; si la conexión se perdió, la vuelve a abrir una vez. */
  async function tx(almacenes, modo) {
    if (bd) {
      try { return bd.transaction(almacenes, modo); } catch { bd = null; }
    }
    bd = await conectar();
    vigilar();
    return bd.transaction(almacenes, modo);
  }

  return {
    async cargar() {
      const t = await tx(['cuentas', 'movimientos', 'ajustes'], 'readonly');
      const [cuentas, movimientos, ajustes] = await Promise.all([
        pedir(t.objectStore('cuentas').getAll()),
        pedir(t.objectStore('movimientos').getAll()),
        pedir(t.objectStore('ajustes').get('ajustes')),
      ]);
      return ponerAlDia({
        cuentas: cuentas.length ? cuentas.sort((a, b) => a.orden - b.orden) : cuentasPorDefecto(),
        movimientos: movimientos.sort((a, b) => a.fecha - b.fecha),
        ajustes: { ...ajustesPorDefecto(), ...(ajustes ?? {}) },
      });
    },
    async guardarCuentas(cuentas) {
      const t = await tx(['cuentas'], 'readwrite');
      t.objectStore('cuentas').clear();
      for (const c of cuentas) t.objectStore('cuentas').put(c);
      await terminar(t);
    },
    async guardarAjustes(ajustes) {
      const t = await tx(['ajustes'], 'readwrite');
      t.objectStore('ajustes').put(ajustes, 'ajustes');
      await terminar(t);
    },
    /**
     * Lee, cambia y guarda los ajustes en una sola transacción, para no
     * pisar lo que otra ventana de Marea haya guardado entretanto.
     */
    async actualizarAjustes(cambio) {
      const t = await tx(['ajustes'], 'readwrite');
      const almacen = t.objectStore('ajustes');
      const lectura = almacen.get('ajustes');
      lectura.onsuccess = () => {
        try { almacen.put(cambio({ ...ajustesPorDefecto(), ...(lectura.result ?? {}) }), 'ajustes'); } catch { t.abort(); }
      };
      await terminar(t);
    },
    async agregarMovimiento(mov) {
      const t = await tx(['movimientos'], 'readwrite');
      t.objectStore('movimientos').put(mov);
      await terminar(t);
    },
    async borrarMovimiento(id) {
      const t = await tx(['movimientos'], 'readwrite');
      t.objectStore('movimientos').delete(id);
      await terminar(t);
    },
    async reemplazarTodo(datos) {
      const t = await tx(['cuentas', 'movimientos', 'ajustes'], 'readwrite');
      t.objectStore('cuentas').clear();
      t.objectStore('movimientos').clear();
      for (const c of datos.cuentas) t.objectStore('cuentas').put(c);
      for (const m of datos.movimientos) t.objectStore('movimientos').put(m);
      t.objectStore('ajustes').put(datos.ajustes, 'ajustes');
      await terminar(t);
    },
  };
}
