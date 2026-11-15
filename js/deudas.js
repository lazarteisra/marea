// Plata que te deben: sale de gastos "me lo devuelven", de préstamos y de cobros. Sin DOM.
import { normalizar } from './texto.js';

/** Lo que de verdad fue gasto tuyo: el monto menos lo que te van a devolver. */
export function gastoPropio(m) {
  return m.monto - (m.devuelven ?? 0);
}

/**
 * Recorre los movimientos en orden de fecha llevando cuánto debe cada
 * persona. Un cobro baja la deuda hasta cero y nunca más: lo que alguien
 * pague de más es plata que te entró, no una deuda tuya. Devuelve las
 * personas y, por movimiento, cuánto cambió lo que te deben en total.
 */
function recorrer(movimientos) {
  const personas = new Map();
  const cambios = new Map();
  const persona = (nombre, fecha) => {
    const k = normalizar(nombre);
    const p = personas.get(k) ?? { persona: nombre.trim(), debe: 0, ultima: -Infinity };
    // Se muestra el nombre como se escribió la última vez.
    if (fecha >= p.ultima) { p.ultima = fecha; p.persona = nombre.trim(); }
    personas.set(k, p);
    return p;
  };
  const conNombre = (m) => typeof m.persona === 'string' && m.persona.trim() !== '';
  for (const m of [...movimientos].sort((a, b) => a.fecha - b.fecha)) {
    if (!conNombre(m)) continue;
    let cambio = 0;
    if (m.tipo === 'gasto' && m.devuelven > 0) cambio = m.devuelven;
    else if (m.tipo === 'prestamo') cambio = m.monto;
    else if (m.tipo === 'cobro') cambio = -Math.min(m.monto, persona(m.persona, m.fecha).debe);
    else continue;
    persona(m.persona, m.fecha).debe += cambio;
    cambios.set(m.id, cambio);
  }
  return { personas: [...personas.values()], cambios };
}

/**
 * Cuánto te debe cada persona, de la que más debe a la que menos. Solo
 * aparecen quienes todavía deben algo.
 */
export function deudas(movimientos) {
  const { personas } = recorrer(movimientos);
  return {
    lista: personas.filter((p) => p.debe > 0).sort((a, b) => b.debe - a.debe).map(({ persona, debe }) => ({ persona, debe })),
    total: personas.reduce((suma, p) => suma + p.debe, 0),
    // Para elegir con un toque: las personas usadas, la más reciente primero.
    recientes: personas.sort((a, b) => b.ultima - a.ultima).map((p) => p.persona),
  };
}

/** Por id de movimiento, cuánto cambió con él lo que te deben en total. */
export function cambiosDeDeuda(movimientos) {
  return recorrer(movimientos).cambios;
}
