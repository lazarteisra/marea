// Cuadrar: comparar lo que Marea calcula con lo que hay de verdad en cada cuenta. Sin DOM.
import { claveDia, diasEntre } from './fechas.js';

/** Nombre con que se anota lo que no se pudo explicar al cuadrar. */
export const SIN_EXPLICAR = 'Sin explicar';

/** "85" → 8500, "0" → 0, "" → null (no contada), algo que no es un monto → undefined. */
export function leerReal(texto) {
  const limpio = texto.trim();
  if (limpio === '') return null;
  if (/^0+([.,]0{0,2})?$/.test(limpio)) return 0;
  // Los mismos límites que cualquier monto de la app: así un ajuste siempre cabe en un movimiento.
  if (!/^(\d{1,6}([.,]\d{0,2})?|[.,]\d{1,2})$/.test(limpio)) return undefined;
  const [enteros, decimales = ''] = limpio.split(/[.,]/);
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

const esMs = (x) => Number.isSafeInteger(x) && x > 0;

/** Un borrador bien formado: { fecha, reales: [{ cuentaId, monto }] }. Si no, null. */
export function borradorValido(b) {
  if (typeof b !== 'object' || b === null || !esMs(b.fecha) || !Array.isArray(b.reales)) return null;
  const vistos = new Set();
  const reales = b.reales.filter((r) => {
    const vale = typeof r === 'object' && r !== null && typeof r.cuentaId === 'string'
      && Number.isSafeInteger(r.monto) && r.monto >= 0 && !vistos.has(r.cuentaId);
    if (vale) vistos.add(r.cuentaId);
    return vale;
  }).map((r) => ({ cuentaId: r.cuentaId, monto: r.monto }));
  return reales.length ? { fecha: b.fecha, reales } : null;
}

/** El último cuadre terminado: { fecha, total }. Si no está bien formado, null. */
export function ultimoValido(u) {
  return typeof u === 'object' && u !== null && esMs(u.fecha) && Number.isSafeInteger(u.total)
    ? { fecha: u.fecha, total: u.total } : null;
}

/**
 * El cuadre a medias, si sigue sirviendo: es de hoy (lo contado ayer ya no
 * vale) y solo con cuentas que siguen activas.
 */
export function borradorVigente(ajustes, cuentas, ahoraMs) {
  const b = borradorValido(ajustes.cuadre);
  if (!b || claveDia(b.fecha) !== claveDia(ahoraMs)) return null;
  const activas = new Set(cuentas.filter((c) => !c.archivada).map((c) => c.id));
  const reales = b.reales.filter((r) => activas.has(r.cuentaId));
  return reales.length ? { fecha: b.fecha, reales } : null;
}

/**
 * Por cada cuenta contada: lo que Marea calcula, lo real y la diferencia
 * (negativa si falta plata, positiva si sobra). En el orden de las cuentas.
 */
export function diferencias(cuentas, saldos, reales) {
  const contado = new Map(reales.map((r) => [r.cuentaId, r.monto]));
  return cuentas.filter((c) => !c.archivada && contado.has(c.id)).map((c) => {
    const calcula = saldos.get(c.id);
    const real = contado.get(c.id);
    return { cuenta: c, calcula, real, dif: real - calcula };
  });
}

/** Toda la plata de las cuentas activas, usando lo contado donde se contó. */
export function totalContado(cuentas, saldos, reales) {
  const contado = new Map(reales.map((r) => [r.cuentaId, r.monto]));
  let total = 0;
  for (const c of cuentas) if (!c.archivada) total += contado.get(c.id) ?? saldos.get(c.id);
  return total;
}

/** Lo más que puede valer un movimiento, en centavos (igual que en el respaldo). */
export const AJUSTE_MAX = 99999999;

/**
 * La marca de ajuste solo vale en lo que quedó "Sin explicar" y no es un
 * pago fijo. `alCuadrar` (gasto olvidado que se anotó al cuadrar) solo vale
 * en gastos. Devuelve el movimiento sin las marcas que no correspondan.
 */
export function marcasLimpias(m) {
  const limpio = { ...m };
  const esAjuste = m.ajuste === true && !m.fijoId
    && ((m.tipo === 'gasto' && m.categoria === SIN_EXPLICAR) || (m.tipo === 'ingreso' && m.origen === SIN_EXPLICAR));
  if (esAjuste) limpio.ajuste = true; else delete limpio.ajuste;
  if (m.alCuadrar === true && m.tipo === 'gasto' && !esAjuste) limpio.alCuadrar = true; else delete limpio.alCuadrar;
  return limpio;
}

/** Hace cuántos días fue el último cuadre y si ya toca recordarlo (más de 3 días, o nunca). */
export function estadoCuadre(ajustes, ahoraMs) {
  const u = ultimoValido(ajustes.ultimoCuadre);
  // Una fecha de cuadre en el futuro (reloj adelantado, respaldo raro) no cuenta.
  if (!u || u.fecha > ahoraMs + 86400000) return { dias: null, recordar: true };
  const dias = Math.max(0, diasEntre(claveDia(u.fecha), claveDia(ahoraMs)));
  return { dias, recordar: dias > 3 };
}

/**
 * El movimiento que deja una diferencia sin explicar. Si falta plata es un
 * gasto; si sobra, un ingreso. Los dos llevan `ajuste: true` para no contar
 * como gasto de hoy ni como ingreso del ciclo.
 */
export function movimientoDeAjuste(id, cuentaId, dif, ahoraMs) {
  const comun = { id, monto: Math.abs(dif), cuentaId, fecha: ahoraMs, nota: '', ajuste: true };
  return dif < 0
    ? { ...comun, tipo: 'gasto', categoria: SIN_EXPLICAR, paraQuien: 'mi' }
    : { ...comun, tipo: 'ingreso', origen: SIN_EXPLICAR };
}
