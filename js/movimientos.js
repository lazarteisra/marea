// Buscar y ordenar movimientos, sin DOM, para poder probarlo.
import { claveDia } from './fechas.js';
import { gastoPropio } from './deudas.js';
import { normalizar } from './texto.js';

/** `tipo` es "todo", "gasto" o "ingreso". El texto busca en qué, de dónde, nota y cuenta. */
export function filtrar(movimientos, cuentas, { texto = '', tipo = 'todo' } = {}) {
  const nombres = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const buscado = normalizar(texto);
  return movimientos.filter((m) => {
    if (tipo !== 'todo' && m.tipo !== tipo) return false;
    if (!buscado) return true;
    const donde = [m.categoria, m.origen, m.nota, m.persona, nombres.get(m.cuentaId), nombres.get(m.cuentaDestinoId)].filter(Boolean).join(' ');
    return normalizar(donde).includes(buscado);
  });
}

/** Del más nuevo al más viejo, en grupos por día con lo gastado y lo entrado. */
export function agruparPorDia(movimientos) {
  const grupos = new Map();
  for (const m of [...movimientos].sort((a, b) => b.fecha - a.fecha)) {
    const dia = claveDia(m.fecha);
    if (!grupos.has(dia)) grupos.set(dia, { dia, gastado: 0, entrado: 0, movimientos: [] });
    const g = grupos.get(dia);
    g.movimientos.push(m);
    // Los ajustes de cuadre y lo anotado al cuadrar no son de ese día: no entran en su cabecera.
    if (m.ajuste || m.alCuadrar) continue;
    if (m.tipo === 'gasto') g.gastado += gastoPropio(m);
    else if (m.tipo === 'ingreso') g.entrado += m.monto;
  }
  return [...grupos.values()];
}
