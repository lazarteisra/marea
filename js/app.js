// Arranque, estado y navegación.
import { abrirAlmacen } from './almacen.js';
import { el } from './dom.js';
import { primeraVez } from './vistas/primeraVez.js';
import { inicio } from './vistas/inicio.js';
import { registrar } from './vistas/registrar.js';
import { ingreso } from './vistas/ingreso.js';
import { ajustes } from './vistas/ajustes.js';
import { movimientos } from './vistas/movimientos.js';
import { presupuesto } from './vistas/presupuesto.js';
import { fijos, fijo, pagarFijo } from './vistas/fijos.js';
import { total, paso, prestamo, cobro } from './vistas/total.js';
import { categoria } from './vistas/categoria.js';
import { cuadrar } from './vistas/cuadrar.js';
import { pin, verificar } from './vistas/pin.js';
import { crearCandado } from './vistas/candado.js';
import { debeBloquear, bloqueoValido } from './bloqueo.js';
import { barraPestanas, VISTAS_CON_BARRA } from './vistas/piezas.js';

const vistas = { primeraVez, inicio, registrar, ingreso, ajustes, movimientos, presupuesto, fijos, fijo, pagarFijo, total, paso, prestamo, cobro, categoria, cuadrar, pin, verificar };
const raiz = document.getElementById('app');
let actual = null;
let enCuadre = false;

/**
 * Lo contado en un cuadre a medias se compara con los saldos. Si entretanto
 * se anota, cambia o borra un movimiento fuera de Cuadrar, esa cuenta ya
 * no sirve: se descarta el borrador y habrá que contar de nuevo.
 */
function conCuadreAlDia(almacen) {
  const soltar = async () => {
    if (!enCuadre && ctx.estado?.ajustes.cuadre) await almacen.actualizarAjustes((a) => ({ ...a, cuadre: null }));
  };
  return {
    ...almacen,
    async agregarMovimiento(mov) { await almacen.agregarMovimiento(mov); await soltar(); },
    async borrarMovimiento(id) { await almacen.borrarMovimiento(id); await soltar(); },
  };
}

const ctx = {
  estado: null,     // { cuentas, movimientos, ajustes }
  almacen: null,
  deshacer: null,   // { texto, accion } que Inicio muestra unos segundos
  ahora: () => Date.now(),
  ir,
  recargar,
};

function ir(nombre, parametros = {}) {
  actual = nombre;
  // Dentro de Cuadrar (o de un formulario abierto desde ahí) los movimientos son parte del cuadre.
  enCuadre = nombre === 'cuadrar' || parametros.volver === 'cuadrar';
  const conBarra = VISTAS_CON_BARRA.includes(nombre);
  let vista;
  try {
    vista = vistas[nombre](ctx, parametros);
  } catch {
    // Datos que una pantalla no sabe pintar: siempre queda el camino a Ajustes
    // para exportar, importar otro respaldo o empezar de cero.
    vista = el('section', { class: 'pantalla' },
      el('h1', { class: 'titulo chico' }, 'Algo no cuadra'),
      el('p', { class: 'parrafo' }, 'Marea no pudo mostrar esta pantalla con los datos guardados. Tus datos siguen en el teléfono.'),
      nombre === 'ajustes' ? null : el('div', { class: 'seccion' },
        el('button', { class: 'boton boton-sec', type: 'button', onclick: () => ir('ajustes') }, 'Ir a Ajustes')));
  }
  document.body.classList.toggle('con-barra', conBarra);
  raiz.replaceChildren(...[vista, conBarra ? barraPestanas(ctx, nombre) : null].filter(Boolean));
  window.scrollTo(0, 0);
  // Dentro del mismo toque, para que el iPhone abra el teclado.
  if (!raiz.hidden) raiz.querySelector('[data-foco]')?.focus();
}

async function recargar() {
  ctx.estado = await ctx.almacen.cargar();
}

async function arrancar() {
  try {
    ctx.almacen = conCuadreAlDia(await abrirAlmacen());
    await recargar();
  } catch {
    raiz.replaceChildren(el('section', { class: 'pantalla' },
      el('h1', { class: 'titulo' }, 'Marea'),
      el('p', { class: 'parrafo' }, 'No se pudieron abrir tus datos en este navegador. Si estás en modo privado, sal de él y vuelve a abrir Marea.')));
    return;
  }
  // Primero el candado: si pintar la pantalla fallara, igual queda cerrado.
  candado.bloquear();
  ir(ctx.estado.ajustes.configurada ? 'inicio' : 'primeraVez');
  // Pide al navegador que no borre los datos por falta de espacio.
  navigator.storage?.persist?.().catch(() => {});
}

// Por aquí se lee y se cambia la cerradura (el candado y la pantalla que verifica).
ctx.puerta = {
  leer: () => ctx.estado?.ajustes.bloqueo ?? null,
  guardar: async (cambio) => {
    // Siempre sobre el dato saneado, para que un contador dañado no rompa la cuenta de fallos.
    await ctx.almacen.actualizarAjustes((a) => ({ ...a, bloqueo: cambio(bloqueoValido(a.bloqueo)) }));
    await recargar();
  },
  ahora: () => ctx.ahora(),
};
const candado = crearCandado({
  raiz,
  puerta: ctx.puerta,
  // Al desbloquear puede haber cambiado el día: Inicio se recalcula.
  alAbrir: () => { if (actual === 'inicio') ir('inicio'); },
});

let ocultoDesde = null;
// Algunas veces el teléfono avisa por aquí antes que por "visibilitychange".
window.addEventListener('pagehide', () => { ocultoDesde ??= Date.now(); candado.cubrir(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    ocultoDesde = Date.now();
    // Se tapa ya, para que el selector de apps no muestre los números.
    candado.cubrir();
    return;
  }
  const desde = ocultoDesde;
  ocultoDesde = null;
  if (candado.estaCerrado()) return;
  if (ctx.estado?.ajustes.bloqueo && debeBloquear(desde, Date.now())) { candado.bloquear(); return; }
  candado.descubrir();
  // Al volver a la app puede haber cambiado el día: Inicio se recalcula.
  if (actual === 'inicio') ir('inicio');
});

arrancar();

// Guarda la app en el teléfono para que abra sin internet.
if ('serviceWorker' in navigator) {
  const teniaVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Si llega una versión nueva mientras está en Inicio, la carga de una vez.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (teniaVersion && actual === 'inicio' && !candado.estaCerrado()) location.reload();
  });
}
