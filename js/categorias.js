// En qué se fue la plata: gasto por categoría del ciclo, comparado con el anterior, y topes. Sin DOM.
import { claveDia, diasEntre } from './fechas.js';
import { cortesDeCiclo } from './calculo.js';
import { esPagoFijo } from './fijos.js';
import { gastoPropio } from './deudas.js';

/** Deja solo los topes bien formados: [{ categoria, monto }], uno por categoría. */
export function topesValidos(topes) {
  if (!Array.isArray(topes)) return [];
  const vistos = new Set();
  return topes.filter((t) => {
    const vale = typeof t === 'object' && t !== null && typeof t.categoria === 'string' && t.categoria !== ''
      && Number.isSafeInteger(t.monto) && t.monto > 0 && !vistos.has(t.categoria);
    if (vale) vistos.add(t.categoria);
    return vale;
  }).map((t) => ({ categoria: t.categoria, monto: t.monto }));
}

/** La lista de topes con el de una categoría puesto, cambiado o quitado (`monto` null). */
export function conTope(topes, categoria, monto) {
  const otros = topesValidos(topes).filter((t) => t.categoria !== categoria);
  return monto === null ? otros : [...otros, { categoria, monto }];
}

/**
 * Gasto propio del ciclo por categoría, de mayor a menor. `antes` es lo
 * gastado en esa categoría en el ciclo anterior a la misma altura (null si
 * no hubo ciclo anterior). Los pagos fijos no entran: tienen su pestaña.
 * También aparecen las categorías con tope aunque aún no tengan gasto.
 */
export function gastoPorCategoria(movimientos, ajustes, ahoraMs) {
  const hoy = claveDia(ahoraMs);
  const cortes = cortesDeCiclo(movimientos, ajustes, hoy);
  const inicio = cortes.at(-1);
  const inicioAnterior = cortes.at(-2) ?? null;
  const altura = diasEntre(inicio, hoy);
  const idsFijos = new Set((Array.isArray(ajustes.fijos) ? ajustes.fijos : []).map((f) => f.id));

  const filas = new Map();
  const fila = (categoria) => {
    if (!filas.has(categoria)) filas.set(categoria, { categoria, gastado: 0, antes: inicioAnterior ? 0 : null, tope: null });
    return filas.get(categoria);
  };
  let total = 0;
  let invite = 0;
  for (const m of movimientos) {
    if (m.tipo !== 'gasto' || esPagoFijo(m, idsFijos)) continue;
    const dia = claveDia(m.fecha);
    const propio = gastoPropio(m);
    if (dia >= inicio) {
      fila(m.categoria).gastado += propio;
      total += propio;
      if (m.paraQuien === 'invite') invite += propio;
    } else if (inicioAnterior && dia >= inicioAnterior && diasEntre(inicioAnterior, dia) <= altura) {
      fila(m.categoria).antes += propio;
    }
  }
  for (const t of topesValidos(ajustes.topes)) fila(t.categoria).tope = t.monto;

  const lista = [...filas.values()].filter((f) => f.gastado > 0 || f.tope !== null)
    .sort((a, b) => b.gastado - a.gastado || String(a.categoria).localeCompare(String(b.categoria)));
  return { lista, total, invite, inicio };
}

/** Los gastos del ciclo en una categoría, del más nuevo al más viejo. */
export function gastosDeCategoria(movimientos, ajustes, categoria, ahoraMs) {
  const inicio = cortesDeCiclo(movimientos, ajustes, claveDia(ahoraMs)).at(-1);
  const idsFijos = new Set((Array.isArray(ajustes.fijos) ? ajustes.fijos : []).map((f) => f.id));
  return movimientos.filter((m) => m.tipo === 'gasto' && m.categoria === categoria && !esPagoFijo(m, idsFijos) && claveDia(m.fecha) >= inicio)
    .sort((a, b) => b.fecha - a.fecha);
}

/** Cuánto se pasaría del tope de la categoría al sumar `propio`; 0 si no hay tope o no se pasa. */
export function excesoDeTope(porCategoria, categoria, propio) {
  const f = porCategoria.lista.find((x) => x.categoria === categoria);
  return f && f.tope !== null ? Math.max(0, f.gastado + propio - f.tope) : 0;
}
