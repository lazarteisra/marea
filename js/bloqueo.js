// Bloqueo de la app: PIN (guardado como huella, nunca tal cual) y reglas de
// cuándo volver a pedirlo. Es una cerradura para que quien agarre el teléfono
// no vea los gastos; no cifra los datos. Sin DOM.

const VUELTAS = 150000;
const GRACIA_MS = 2 * 60 * 1000;
const FALLOS_LIBRES = 5;

/** Un PIN son de 4 a 6 números. */
export function pinValido(texto) {
  return typeof texto === 'string' && /^\d{4,6}$/.test(texto);
}

export function aBase64(bytes) {
  let binario = '';
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
  return btoa(binario);
}

export function deBase64(texto) {
  const binario = atob(texto);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

async function huella(pin, sal, vueltas) {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: vueltas }, clave, 256));
}

/** Lo que se guarda de un PIN: una sal al azar y su huella. */
export async function crearPin(pin) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return { sal: aBase64(sal), hash: aBase64(await huella(pin, sal, VUELTAS)), vueltas: VUELTAS };
}

/**
 * Compara un PIN con el guardado: "si", "no" o "error". "error" es que el
 * teléfono no pudo hacer la cuenta (no que el PIN esté mal), y no debe
 * contarse como intento fallido.
 */
export async function resultadoPin(pin, guardado) {
  if (!pinValido(pin)) return 'no';
  let esperado;
  let sal;
  try {
    esperado = deBase64(guardado.hash);
    sal = deBase64(guardado.sal);
  } catch {
    return 'no';
  }
  let obtenido;
  try {
    obtenido = await huella(pin, sal, guardado.vueltas);
  } catch {
    return 'error';
  }
  if (esperado.length !== obtenido.length) return 'no';
  let distinto = 0;
  for (let i = 0; i < esperado.length; i++) distinto |= esperado[i] ^ obtenido[i];
  return distinto === 0 ? 'si' : 'no';
}

/** true si `pin` es el que se guardó. Nunca lanza: ante cualquier rareza, false. */
export async function comprobarPin(pin, guardado) {
  return (await resultadoPin(pin, guardado)) === 'si';
}

/** Los bytes de un texto en base64 corriente, o null si no lo es. */
function bytesDe(texto, largoMax) {
  if (typeof texto !== 'string' || texto.length === 0 || texto.length > largoMax || !/^[A-Za-z0-9+/]+={0,2}$/.test(texto)) return null;
  try { return deBase64(texto); } catch { return null; }
}

/**
 * La configuración del bloqueo, si está entera: { pin, credencial, fallos,
 * ultimo }. Solo vale si con ella algún PIN puede abrir (sal y huella del
 * tamaño que produce `crearPin`). Si algo no cuadra devuelve null, es
 * decir, sin bloqueo: mejor abrir de más que dejar a su dueño sin poder entrar.
 */
export function bloqueoValido(b) {
  if (typeof b !== 'object' || b === null || typeof b.pin !== 'object' || b.pin === null) return null;
  const { sal, hash, vueltas } = b.pin;
  const bytesSal = bytesDe(sal, 64);
  const bytesHash = bytesDe(hash, 64);
  if (!bytesSal || bytesSal.length < 8 || !bytesHash || bytesHash.length !== 32) return null;
  if (!Number.isSafeInteger(vueltas) || vueltas < 1000 || vueltas > 5000000) return null;
  const llave = bytesDe(b.credencial, 2048);
  return {
    pin: { sal, hash, vueltas },
    credencial: llave && llave.length >= 8 ? b.credencial : null,
    fallos: Number.isSafeInteger(b.fallos) && b.fallos > 0 ? Math.min(b.fallos, 1000) : 0,
    ultimo: Number.isSafeInteger(b.ultimo) && b.ultimo > 0 ? b.ultimo : 0,
  };
}

/** Al volver a la app: ¿pasó más que la gracia (2 minutos) desde que se salió? */
export function debeBloquear(ocultoDesdeMs, ahoraMs) {
  if (ocultoDesdeMs === null) return false;
  const fuera = ahoraMs - ocultoDesdeMs;
  // Si el reloj retrocedió no se puede saber cuánto pasó: se bloquea.
  return fuera < 0 || fuera > GRACIA_MS;
}

const ESPERA_MAX = 15 * 60 * 1000;
/** Desde el quinto fallo seguido: 30 s, y el doble cada vez, hasta 15 minutos. */
const esperaDe = (fallos) => (fallos < FALLOS_LIBRES ? 0 : Math.min(ESPERA_MAX, 30000 * 2 ** Math.min(fallos - FALLOS_LIBRES, 20)));

/**
 * Milisegundos que faltan para poder probar otro PIN (0 si ya se puede).
 * Se cuenta desde el último fallo. Si el reloj está antes de ese momento
 * (lo atrasaron), la espera vale entera: atrasar el reloj no la acorta.
 * Adelantarlo sí la acorta; sin un servidor no hay cómo evitarlo.
 */
export function esperaPorFallos(b, ahoraMs) {
  const total = esperaDe(b.fallos);
  if (!total) return 0;
  if (ahoraMs < b.ultimo) return total;
  return Math.max(0, b.ultimo + total - ahoraMs);
}

/** Si el reloj quedó antes del último fallo, la espera empieza a contar desde ahora (y no encierra para siempre). */
export function conRelojAlDia(b, ahoraMs) {
  return b.fallos > 0 && ahoraMs < b.ultimo ? { ...b, ultimo: ahoraMs } : b;
}

/** Tras un PIN equivocado. */
export function conFallo(b, ahoraMs) {
  return { ...b, fallos: b.fallos + 1, ultimo: ahoraMs };
}

export function sinFallos(b) {
  return { ...b, fallos: 0, ultimo: 0 };
}

/** "30 segundos", "2 minutos" */
export function textoEspera(ms) {
  const segundos = Math.ceil(ms / 1000);
  if (segundos < 60) return `${segundos} ${segundos === 1 ? 'segundo' : 'segundos'}`;
  const minutos = Math.ceil(segundos / 60);
  return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
}

/** Días desde la última copia de seguridad y si ya conviene hacer otra. */
export function estadoCopia(ajustes, hayMovimientos, ahoraMs) {
  const ultima = Number.isSafeInteger(ajustes.ultimaCopia) && ajustes.ultimaCopia > 0 && ajustes.ultimaCopia <= ahoraMs + 86400000 ? ajustes.ultimaCopia : null;
  if (ultima === null) return { dias: null, toca: hayMovimientos };
  const dias = Math.max(0, Math.floor((ahoraMs - ultima) / 86400000));
  return { dias, toca: hayMovimientos && dias >= 7 };
}
