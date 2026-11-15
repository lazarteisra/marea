// Pagos fijos (gimnasio, suscripciones…): qué falta pagar en el ciclo. Sin DOM.
import { claveDia, diasEntre } from './fechas.js';

/**
 * Un gasto es un pago fijo solo si su fijo sigue en la lista. Si el fijo se
 * quitó (o el respaldo trae un `fijoId` suelto), es un gasto como cualquiera.
 */
export function esPagoFijo(m, idsConocidos) {
  return m.tipo === 'gasto' && Boolean(m.fijoId) && idsConocidos.has(m.fijoId);
}

/** Deja solo los fijos bien formados; lo demás se descarta sin romper nada. */
export function fijosValidos(fijos) {
  if (!Array.isArray(fijos)) return [];
  return fijos.filter((f) => typeof f === 'object' && f !== null
    && typeof f.id === 'string' && f.id !== '' && typeof f.nombre === 'string' && f.nombre !== ''
    && Number.isSafeInteger(f.estimado) && f.estimado > 0)
    .map((f) => ({ ...f, dia: Number.isInteger(f.dia) && f.dia >= 1 && f.dia <= 28 ? f.dia : null }));
}

/** Primer día con ese número (1–28) desde `inicio` inclusive. */
export function diaQueToca(inicio, dia) {
  let [a, m] = inicio.split('-').map(Number);
  if (Number(inicio.slice(8)) > dia) m += 1;
  if (m > 12) { m = 1; a += 1; }
  const dos = (n) => String(n).padStart(2, '0');
  return `${a}-${dos(m)}-${dos(dia)}`;
}

/**
 * Estado de cada pago fijo en el ciclo que empezó en `inicio`. Un fijo está
 * pagado si hay un gasto ligado a él (`fijoId`) dentro del ciclo.
 * `faltan` son los días hasta que toca (negativo si ya pasó); null sin día.
 * Con `desdeMs` (el instante de la mensualidad que abrió el ciclo) un pago
 * hecho ese mismo día pero antes de la mensualidad cuenta para el ciclo viejo.
 */
export function estadoFijos(fijos, movimientos, inicio, hoy, desdeMs = null) {
  const validos = Array.isArray(fijos) ? fijos : [];
  const conocidos = new Set(validos.map((f) => f.id));
  const pagos = new Map();
  let pagado = 0;
  for (const m of movimientos) {
    if (!esPagoFijo(m, conocidos)) continue;
    if (desdeMs === null ? claveDia(m.fecha) < inicio : m.fecha < desdeMs) continue;
    pagado += m.monto;
    const previo = pagos.get(m.fijoId);
    if (!previo || m.fecha > previo.fecha) pagos.set(m.fijoId, m);
  }
  const lista = validos.map((fijo) => {
    const toca = fijo.dia ? diaQueToca(inicio, fijo.dia) : null;
    return { fijo, pago: pagos.get(fijo.id) ?? null, toca, faltan: toca ? diasEntre(hoy, toca) : null };
  });
  // Primero lo que falta pagar, por cercanía; lo sin día al final; lo pagado abajo.
  const peso = (e) => (e.pago ? 2 : e.faltan === null ? 1 : 0);
  lista.sort((x, y) => peso(x) - peso(y) || (x.faltan ?? 0) - (y.faltan ?? 0));
  let porPagar = 0;
  for (const e of lista) if (!e.pago) porPagar += e.fijo.estimado;
  return { lista, porPagar, pagado };
}

/** "toca hoy", "toca en 5 días", "tocaba hace 2 días" o "" si no tiene día. */
export function textoToca(faltan) {
  if (faltan === null) return '';
  if (faltan === 0) return 'toca hoy';
  if (faltan === 1) return 'toca mañana';
  if (faltan > 1) return `toca en ${faltan} días`;
  return faltan === -1 ? 'tocaba ayer' : `tocaba hace ${-faltan} días`;
}
