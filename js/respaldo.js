// Exportar e importar todos los datos como un archivo.

const VERSION = 1;
const TAM_MAX = 5 * 1024 * 1024;
const MONTO_MAX = 99999999;
const SALDO_MAX = 9999999999;
const MAX_MOVIMIENTOS = 100000;

export function exportar(datos, ahoraMs) {
  return JSON.stringify({
    app: 'marea', version: VERSION, exportado: ahoraMs,
    cuentas: datos.cuentas, movimientos: datos.movimientos, ajustes: datos.ajustes,
  });
}

const esObjeto = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const esTexto = (x, min = 0, max = 200) => typeof x === 'string' && x.length >= min && x.length <= max;
const esEntero = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
const esLista = (x, max) => Array.isArray(x) && x.length <= max;
const listaDeTextos = (x) => esLista(x, 50) && x.length > 0 && x.every((t) => esTexto(t, 1, 40));

// Del año 2000 al 9999: fuera de eso las cuentas de días dejan de tener sentido.
const FECHA_MIN = Date.UTC(2000, 0, 1);
const FECHA_MAX = Date.UTC(9999, 11, 31);

/** "2026-11-14" que además sea un día que existe. */
function esDia(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return a >= 2000 && f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

function leerCuenta(c) {
  if (!esObjeto(c) || !esTexto(c.id, 1, 60) || !esTexto(c.nombre, 1, 40)) return null;
  if (!esEntero(c.saldoInicial, -SALDO_MAX, SALDO_MAX) || !esEntero(c.orden, 0, 1000)) return null;
  if (typeof c.archivada !== 'boolean') return null;
  return { id: c.id, nombre: c.nombre, saldoInicial: c.saldoInicial, orden: c.orden, archivada: c.archivada };
}

function leerMovimiento(m, idsCuentas) {
  if (!esObjeto(m) || !esTexto(m.id, 1, 60)) return null;
  if (!esEntero(m.monto, 1, MONTO_MAX) || !esEntero(m.fecha, FECHA_MIN, FECHA_MAX)) return null;
  if (!idsCuentas.has(m.cuentaId)) return null;
  const nota = m.nota === undefined ? '' : m.nota;
  if (!esTexto(nota)) return null;
  const comun = { id: m.id, tipo: m.tipo, monto: m.monto, cuentaId: m.cuentaId, fecha: m.fecha, nota };
  if (m.tipo === 'gasto') {
    if (!esTexto(m.categoria, 1, 40) || !['mi', 'invite'].includes(m.paraQuien)) return null;
    return { ...comun, categoria: m.categoria, paraQuien: m.paraQuien };
  }
  if (m.tipo === 'ingreso') {
    if (!esTexto(m.origen, 1, 40)) return null;
    return { ...comun, origen: m.origen };
  }
  return null;
}

function leerAjustes(a, idsCuentas) {
  if (!esObjeto(a) || !esEntero(a.diaMensualidad, 1, 28)) return null;
  if (!listaDeTextos(a.categorias) || !listaDeTextos(a.origenes)) return null;
  if (typeof a.configurada !== 'boolean') return null;
  const inicio = a.inicio ?? null;
  if (inicio !== null && !esDia(inicio)) return null;
  const ultima = a.ultimaCuentaId ?? null;
  if (ultima !== null && !idsCuentas.has(ultima)) return null;
  return {
    diaMensualidad: a.diaMensualidad, categorias: [...a.categorias], origenes: [...a.origenes],
    ultimaCuentaId: ultima, inicio, configurada: a.configurada,
  };
}

const mal = (motivo) => ({ ok: false, motivo });

/** Revisa un archivo de respaldo campo por campo. No modifica nada. */
export function validarRespaldo(texto) {
  if (typeof texto !== 'string' || texto.length > TAM_MAX) return mal('El archivo es demasiado grande.');
  let o;
  try { o = JSON.parse(texto); } catch { return mal('El archivo no es un respaldo de Marea.'); }
  if (!esObjeto(o) || o.app !== 'marea') return mal('El archivo no es un respaldo de Marea.');
  if (o.version !== VERSION) return mal('El respaldo es de otra versión de Marea.');

  if (!esLista(o.cuentas, 50) || o.cuentas.length === 0) return mal('El respaldo no tiene cuentas.');
  const cuentas = o.cuentas.map(leerCuenta);
  if (cuentas.includes(null)) return mal('Una cuenta del respaldo está dañada.');
  const idsCuentas = new Set(cuentas.map((c) => c.id));
  if (idsCuentas.size !== cuentas.length) return mal('El respaldo tiene cuentas repetidas.');
  if (cuentas.every((c) => c.archivada)) return mal('El respaldo no tiene ninguna cuenta activa.');

  if (!esLista(o.movimientos, MAX_MOVIMIENTOS)) return mal('Los movimientos del respaldo están dañados.');
  const movimientos = o.movimientos.map((m) => leerMovimiento(m, idsCuentas));
  if (movimientos.includes(null)) return mal('Un movimiento del respaldo está dañado.');
  if (new Set(movimientos.map((m) => m.id)).size !== movimientos.length) return mal('El respaldo tiene movimientos repetidos.');

  const ajustes = leerAjustes(o.ajustes, idsCuentas);
  if (!ajustes) return mal('Los ajustes del respaldo están dañados.');

  return { ok: true, datos: { cuentas, movimientos, ajustes } };
}
