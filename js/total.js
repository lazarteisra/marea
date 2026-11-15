// Toda tu plata junta (cuentas más lo que te deben) y cómo cambia día a día. Sin DOM.
import { claveDia, diasEntre, sumarDias } from './fechas.js';
import { cambiosDeDeuda } from './deudas.js';

/**
 * Cuánto cambia el total (cuentas activas más lo que te deben) con un
 * movimiento. `enDeuda` es cuánto cambió con él lo que te deben. Pasar,
 * prestar o cobrar lo debido no cambia el total: la plata solo cambia de
 * lugar. Las cuentas archivadas no cuentan.
 */
export function cambioEnTotal(m, activas, enDeuda = 0) {
  const en = (id) => (activas.has(id) ? 1 : 0);
  let enCuentas = 0;
  if (m.tipo === 'gasto' || m.tipo === 'prestamo') enCuentas = -m.monto * en(m.cuentaId);
  else if (m.tipo === 'ingreso' || m.tipo === 'cobro') enCuentas = m.monto * en(m.cuentaId);
  else if (m.tipo === 'paso') enCuentas = -m.monto * en(m.cuentaId) + m.monto * en(m.cuentaDestinoId);
  return enCuentas + enDeuda;
}

/**
 * El total al cierre de cada día (el último punto es siempre la suma de
 * las cuentas activas más lo que te deben), desde que empezó a usar la app (o desde
 * el primer movimiento) hasta hoy: [{ dia, total }].
 */
export function serieTotal(cuentas, movimientos, ajustes, ahoraMs) {
  const hoy = claveDia(ahoraMs);
  const activas = new Set(cuentas.filter((c) => !c.archivada).map((c) => c.id));
  let desde = ajustes.inicio && ajustes.inicio <= hoy ? ajustes.inicio : hoy;
  for (const m of movimientos) if (claveDia(m.fecha) < desde) desde = claveDia(m.fecha);

  const dias = Math.max(1, diasEntre(desde, hoy) + 1);
  const porDia = new Array(dias).fill(0);
  let total = 0;
  for (const c of cuentas) if (!c.archivada) total += c.saldoInicial;
  const enDeuda = cambiosDeDeuda(movimientos);
  for (const m of movimientos) {
    // Un movimiento con fecha futura ya cuenta en los saldos: entra en hoy.
    const i = Math.min(dias - 1, diasEntre(desde, claveDia(m.fecha)));
    porDia[i] += cambioEnTotal(m, activas, enDeuda.get(m.id) ?? 0);
  }
  return porDia.map((cambio, i) => ({ dia: sumarDias(desde, i), total: (total += cambio) }));
}

/** Los últimos `dias` de la serie (toda si `dias` es null) y cuánto cambió en ese tramo. */
export function tramo(serie, dias) {
  const puntos = dias === null ? serie : serie.slice(-(dias + 1));
  return { puntos, cambio: puntos.at(-1).total - puntos[0].total, desde: puntos[0].dia };
}
