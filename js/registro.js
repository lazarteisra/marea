// Lógica de las pantallas de registro, sin DOM, para poder probarla.
import { aBsEnteros } from './dinero.js';

/** Las opciones más usadas van primero; en empate se respeta el orden dado. */
export function ordenarPorUso(opciones, movimientos, campo) {
  const usos = new Map(opciones.map((o) => [o, 0]));
  for (const m of movimientos) if (usos.has(m[campo])) usos.set(m[campo], usos.get(m[campo]) + 1);
  return [...opciones].sort((a, b) => usos.get(b) - usos.get(a));
}

/** Partes del aviso; la cifra del exceso va marcada para pintarse en rojo. */
export function partesAviso(aviso, hayMasDias) {
  if (aviso.excesoHoy <= 0) return [{ texto: 'Sigues dentro de lo de hoy.' }];
  const partes = [{ texto: 'Con esto te pasas ' }, { texto: `${aBsEnteros(aviso.excesoHoy)} Bs`, tipo: 'pasa' }, { texto: ' de hoy.' }];
  if (hayMasDias) partes.push({ texto: ' Desde mañana te quedan ' }, { texto: `${aBsEnteros(aviso.porDiaManana)} Bs por día`, tipo: 'fuerte' }, { texto: '.' });
  return partes;
}

export function textoAviso(aviso, hayMasDias) {
  return partesAviso(aviso, hayMasDias).map((p) => p.texto).join('');
}

/**
 * Envuelve una acción para que un doble toque no la ejecute dos veces.
 * Si falla y hay `alFallar`, lo llama en vez de dejar el error sin mostrar.
 */
export function crearGuardador(fn, alFallar) {
  let ocupado = false;
  return async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await fn();
    } catch (error) {
      if (!alFallar) throw error;
      alFallar(error);
    } finally {
      ocupado = false;
    }
  };
}

/**
 * Lo que más ha escrito en "¿Qué fue?" para una categoría ("baño", "pollo"),
 * para repetirlo con un toque. Sin categoría elegida, de todos los gastos.
 */
export function detallesRecientes(movimientos, categoria, max = 5) {
  const vistos = new Map();
  for (const m of movimientos) {
    const texto = (m.nota ?? '').trim();
    if (m.tipo !== 'gasto' || !texto || (categoria && m.categoria !== categoria)) continue;
    const clave = texto.toLowerCase();
    const previo = vistos.get(clave);
    vistos.set(clave, { texto, usos: (previo?.usos ?? 0) + 1, ultima: Math.max(previo?.ultima ?? 0, m.fecha ?? 0) });
  }
  return [...vistos.values()].sort((a, b) => b.usos - a.usos || b.ultima - a.ultima).slice(0, max).map((v) => v.texto);
}
