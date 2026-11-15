// Saldos, ciclo de mensualidad y monto por día. Todo en centavos.
import { claveDia, diasEntre } from './fechas.js';

/** Saldo de cada cuenta: saldo inicial − gastos + ingresos. */
export function saldos(cuentas, movimientos) {
  const mapa = new Map(cuentas.map((c) => [c.id, c.saldoInicial]));
  for (const m of movimientos) {
    if (!mapa.has(m.cuentaId)) continue;
    if (m.tipo === 'ingreso') mapa.set(m.cuentaId, mapa.get(m.cuentaId) + m.monto);
    else if (m.tipo === 'gasto') mapa.set(m.cuentaId, mapa.get(m.cuentaId) - m.monto);
  }
  return mapa;
}

function siguienteConDia(clave, dia) {
  let [a, m] = clave.split('-').map(Number);
  const d = Number(clave.slice(8));
  if (d >= dia) m += 1;
  if (m > 12) { m = 1; a += 1; }
  const dos = (n) => String(n).padStart(2, '0');
  return `${a}-${dos(m)}-${dos(dia)}`;
}

/**
 * Fecha esperada de la próxima mensualidad: la primera con ese día después
 * de la última mensualidad registrada (o del día en que empezó a usar la app). Si cae a
 * menos de 15 días de la última, esa llegó adelantada y se toma el mes siguiente.
 */
export function proximaMensualidad(hoyClave, ultimaClave, dia, inicioClave = null) {
  // Sin mensualidad registrada, el primer ciclo se cuenta desde que empezó a
  // usar la app; así también queda "esperando" si la primera se atrasa.
  if (!ultimaClave) return siguienteConDia(inicioClave ?? hoyClave, dia);
  let candidata = siguienteConDia(ultimaClave, dia);
  if (diasEntre(ultimaClave, candidata) < 15) candidata = siguienteConDia(candidata, dia);
  return candidata;
}

function ultimaMensualidad(movimientos) {
  let ultima = null;
  for (const m of movimientos) {
    if (m.tipo === 'ingreso' && m.origen === 'Mensualidad' && (ultima === null || m.fecha > ultima)) ultima = m.fecha;
  }
  return ultima === null ? null : claveDia(ultima);
}

/** Todo lo que Inicio necesita saber. */
export function resumen(cuentas, movimientos, ajustes, ahoraMs) {
  const hoy = claveDia(ahoraMs);
  const porCuenta = saldos(cuentas, movimientos);
  let disponible = 0;
  for (const c of cuentas) if (!c.archivada) disponible += porCuenta.get(c.id);

  let gastadoHoy = 0;
  for (const m of movimientos) {
    if (m.tipo === 'gasto' && claveDia(m.fecha) === hoy) gastadoHoy += m.monto;
  }

  const proxima = proximaMensualidad(hoy, ultimaMensualidad(movimientos), ajustes.diaMensualidad, ajustes.inicio ?? null);
  const faltan = diasEntre(hoy, proxima);
  const esperando = faltan <= 0;
  const dias = Math.max(1, faltan);

  const porDia = Math.max(0, Math.floor((disponible + gastadoHoy) / dias));
  return {
    disponible, dias, esperando, porDia, gastadoHoy,
    sobraHoy: Math.max(0, porDia - gastadoHoy),
    excesoHoy: Math.max(0, gastadoHoy - porDia),
    saldos: porCuenta,
  };
}

/** Cómo queda el día si se guarda un gasto de `monto`. */
export function avisoGasto(r, monto) {
  return {
    excesoHoy: Math.max(0, r.gastadoHoy + monto - r.porDia),
    porDiaManana: Math.max(0, Math.floor((r.disponible - monto) / Math.max(1, r.dias - 1))),
  };
}

/**
 * Gasto acumulado día por día del ciclo actual y del anterior, para
 * compararlos. Un ciclo empieza con cada mensualidad; el primero, el día
 * en que empezó a usar la app. `actual[i]` es lo gastado hasta el día i.
 */
export function gastoPorCiclo(movimientos, ajustes, ahoraMs) {
  const hoy = claveDia(ahoraMs);
  const cortes = new Set();
  if (ajustes.inicio) cortes.add(ajustes.inicio);
  for (const m of movimientos) if (m.tipo === 'ingreso' && m.origen === 'Mensualidad') cortes.add(claveDia(m.fecha));
  const orden = [...cortes].filter((c) => c <= hoy).sort();
  if (!orden.length) {
    const primero = movimientos.reduce((min, m) => (claveDia(m.fecha) < min ? claveDia(m.fecha) : min), hoy);
    orden.push(primero);
  }
  const inicio = orden.at(-1);
  const inicioAnterior = orden.at(-2) ?? null;

  const acumular = (desde, dias) => {
    const porDia = new Array(Math.max(1, dias)).fill(0);
    for (const m of movimientos) {
      if (m.tipo !== 'gasto') continue;
      const i = diasEntre(desde, claveDia(m.fecha));
      if (i >= 0 && i < dias) porDia[i] += m.monto;
    }
    let suma = 0;
    return porDia.map((v) => (suma += v));
  };

  const actual = acumular(inicio, diasEntre(inicio, hoy) + 1);
  const anterior = inicioAnterior ? acumular(inicioAnterior, diasEntre(inicioAnterior, inicio)) : null;
  return {
    inicio, actual, total: actual.at(-1), anterior,
    anteriorMismoDia: anterior ? anterior[Math.min(actual.length, anterior.length) - 1] : null,
  };
}
