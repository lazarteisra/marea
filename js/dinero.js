// Dinero siempre en centavos enteros.

const FORMATO = /^\d{1,6}([.,]\d{1,2})?$/;

/** Convierte lo que escribe la persona a centavos. Devuelve null si no vale. */
export function aCentavos(texto) {
  if (typeof texto !== 'string') return null;
  const limpio = texto.trim();
  if (!FORMATO.test(limpio)) return null;
  const [enteros, decimales = ''] = limpio.split(/[.,]/);
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  return centavos > 0 ? centavos : null;
}

/** 7000 → "70", 1250 → "12,50", -500 → "-5" */
export function aTexto(centavos) {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  const enteros = Math.floor(abs / 100);
  const resto = abs % 100;
  return signo + enteros + (resto ? ',' + String(resto).padStart(2, '0') : '');
}

/** Solo bolivianos enteros, redondeando hacia abajo: 3647 → "36" */
export function aBsEnteros(centavos) {
  return String(Math.floor(Math.max(0, centavos) / 100));
}
