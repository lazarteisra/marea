// Comparar textos escritos a mano sin que importen mayúsculas, tildes ni espacios de más.

/** "  José   María " → "jose maria" */
export function normalizar(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
