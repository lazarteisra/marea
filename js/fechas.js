// Días según la hora local del teléfono.

/** "2026-11-14" */
export function claveDia(ms) {
  const d = new Date(ms);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function aUTC(clave) {
  const [a, m, d] = clave.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Días de calendario desde claveA hasta claveB (negativo si B es anterior). */
export function diasEntre(claveA, claveB) {
  return Math.round((aUTC(claveB) - aUTC(claveA)) / 86400000);
}

export function inicioDelDia(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Clave del día `dias` después (o antes) de `clave`. */
export function sumarDias(clave, dias) {
  const d = new Date(aUTC(clave) + dias * 86400000);
  return d.toISOString().slice(0, 10);
}
