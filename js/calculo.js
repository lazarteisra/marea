// Saldos, ciclo de mensualidad y monto por día. Todo en centavos.
import { claveDia, diasEntre } from './fechas.js';
import { estadoFijos, esPagoFijo } from './fijos.js';
import { gastoPropio } from './deudas.js';

/**
 * Saldo de cada cuenta. Entran ingresos y cobros; salen gastos y préstamos
 * (el gasto sale entero, aunque parte te la devuelvan). Un paso sale de una
 * cuenta y entra en otra.
 */
export function saldos(cuentas, movimientos) {
  const mapa = new Map(cuentas.map((c) => [c.id, c.saldoInicial]));
  const mover = (id, cambio) => { if (mapa.has(id)) mapa.set(id, mapa.get(id) + cambio); };
  for (const m of movimientos) {
    if (m.tipo === 'ingreso' || m.tipo === 'cobro') mover(m.cuentaId, m.monto);
    else if (m.tipo === 'gasto' || m.tipo === 'prestamo') mover(m.cuentaId, -m.monto);
    else if (m.tipo === 'paso') { mover(m.cuentaId, -m.monto); mover(m.cuentaDestinoId, m.monto); }
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

/** Instante de la mensualidad que abrió el ciclo actual, o null si aún no hubo ninguna. */
function inicioCicloMs(movimientos, hoy) {
  let ultima = null;
  for (const m of movimientos) {
    if (m.tipo === 'ingreso' && m.origen === 'Mensualidad' && claveDia(m.fecha) <= hoy && (ultima === null || m.fecha > ultima)) ultima = m.fecha;
  }
  return ultima;
}

/** Todo lo que Inicio necesita saber. */
export function resumen(cuentas, movimientos, ajustes, ahoraMs) {
  const hoy = claveDia(ahoraMs);
  const porCuenta = saldos(cuentas, movimientos);
  let disponible = 0;
  for (const c of cuentas) if (!c.archivada) disponible += porCuenta.get(c.id);

  // Lo que falta pagar de los fijos se aparta: no cuenta para gastar.
  const inicioCiclo = cortesDeCiclo(movimientos, ajustes, hoy).at(-1);
  const fijos = estadoFijos(ajustes.fijos, movimientos, inicioCiclo, hoy, inicioCicloMs(movimientos, hoy));
  disponible -= fijos.porPagar;

  // Pagar un fijo no es gasto de hoy: esa plata ya estaba apartada. Solo
  // cuenta lo que costó de más sobre lo estimado.
  const estimados = new Map(fijos.lista.map((e) => [e.fijo.id, e.fijo.estimado]));
  const idsFijos = new Set(estimados.keys());
  let gastadoHoy = 0;
  for (const m of movimientos) {
    if (m.tipo !== 'gasto' || claveDia(m.fecha) !== hoy) continue;
    // Lo que te van a devolver tampoco es gasto tuyo.
    gastadoHoy += esPagoFijo(m, idsFijos) ? Math.max(0, gastoPropio(m) - estimados.get(m.fijoId)) : gastoPropio(m);
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
    saldos: porCuenta, apartado: fijos.porPagar, inicioCiclo, fijos,
  };
}

/**
 * Cómo queda el día si se guarda un gasto de `monto`. Si parte te la
 * devuelven, `propio` es lo que de verdad gastas tú; la plata igual sale entera.
 */
export function avisoGasto(r, monto, propio = monto) {
  // La plata sale entera, así que el monto por día de hoy baja con lo que
  // te van a devolver: se compara contra ese monto nuevo.
  const porDiaHoy = Math.max(0, Math.floor((r.disponible - monto + r.gastadoHoy + propio) / r.dias));
  return {
    excesoHoy: Math.max(0, r.gastadoHoy + propio - porDiaHoy),
    porDiaManana: Math.max(0, Math.floor((r.disponible - monto) / Math.max(1, r.dias - 1))),
  };
}

/**
 * Días en que empezó cada ciclo, en orden. Un ciclo empieza con cada
 * mensualidad; el primero, el día en que empezó a usar la app.
 */
export function cortesDeCiclo(movimientos, ajustes, hoy) {
  const cortes = new Set();
  if (ajustes.inicio) cortes.add(ajustes.inicio);
  for (const m of movimientos) if (m.tipo === 'ingreso' && m.origen === 'Mensualidad') cortes.add(claveDia(m.fecha));
  const orden = [...cortes].filter((c) => c <= hoy).sort();
  if (!orden.length) {
    orden.push(movimientos.reduce((min, m) => (claveDia(m.fecha) < min ? claveDia(m.fecha) : min), hoy));
  }
  return orden;
}

/**
 * El ciclo actual en cifras, para Presupuesto. `queda` ya descuenta lo
 * apartado para pagos fijos; `presupuesto` es lo que había para gastar
 * libremente: lo ya gastado más lo que queda.
 */
export function resumenCiclo(cuentas, movimientos, ajustes, ahoraMs) {
  const r = resumen(cuentas, movimientos, ajustes, ahoraMs);
  const idsFijos = new Set(r.fijos.lista.map((e) => e.fijo.id));
  let gastado = 0;
  let mensualidad = 0;
  let sueltos = 0;
  for (const m of movimientos) {
    if (claveDia(m.fecha) < r.inicioCiclo) continue;
    if (m.tipo === 'gasto' && !esPagoFijo(m, idsFijos)) gastado += gastoPropio(m);
    else if (m.tipo === 'ingreso' && m.origen === 'Mensualidad') mensualidad += m.monto;
    else if (m.tipo === 'ingreso') sueltos += m.monto;
  }
  const queda = Math.max(0, r.disponible);
  return {
    gastado, queda, presupuesto: gastado + queda,
    porDia: r.porDia, dias: r.dias, esperando: r.esperando,
    fijosPorPagar: r.fijos.porPagar, fijosPagado: r.fijos.pagado,
    mensualidad, sueltos, entrado: mensualidad + sueltos,
  };
}

/**
 * Gasto acumulado (sin pagos fijos) día por día del ciclo actual y del anterior, para
 * compararlos. Un ciclo empieza con cada mensualidad; el primero, el día
 * en que empezó a usar la app. `actual[i]` es lo gastado hasta el día i.
 */
export function gastoPorCiclo(movimientos, ajustes, ahoraMs) {
  const hoy = claveDia(ahoraMs);
  const orden = cortesDeCiclo(movimientos, ajustes, hoy);
  const inicio = orden.at(-1);
  const inicioAnterior = orden.at(-2) ?? null;

  const idsFijos = new Set((Array.isArray(ajustes.fijos) ? ajustes.fijos : []).map((f) => f.id));
  const acumular = (desde, dias) => {
    const porDia = new Array(Math.max(1, dias)).fill(0);
    for (const m of movimientos) {
      // Los pagos fijos no cuentan: ya estaban apartados y no son gasto del día a día.
      if (m.tipo !== 'gasto' || esPagoFijo(m, idsFijos)) continue;
      const i = diasEntre(desde, claveDia(m.fecha));
      if (i >= 0 && i < dias) porDia[i] += gastoPropio(m);
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
