// La pantalla de candado y la huella/Face ID. Tapa la app sin destruirla,
// para que lo que estaba a medio escribir siga ahí al desbloquear.
import { el } from '../dom.js';
import { aBase64, deBase64, resultadoPin, pinValido, esperaPorFallos, conFallo, sinFallos, conRelojAlDia, textoEspera } from '../bloqueo.js';

const azar = (n) => crypto.getRandomValues(new Uint8Array(n));
const TOPE_BIOMETRIA_MS = 70000;
const TOPE_GUARDADO_MS = 3000;

/** Espera una promesa, pero no más que `ms`. Nunca lanza. */
const conTope = (promesa, ms) => Promise.race([
  Promise.resolve(promesa).catch(() => {}),
  new Promise((ok) => setTimeout(ok, ms)),
]);

/** En el byte de banderas, el bit 4 dice que el teléfono verificó a la persona (cara, huella o su código). */
const verificado = (datos) => { const b = new Uint8Array(datos); return b.length > 32 && (b[32] & 0x04) !== 0; };

/** ¿Este teléfono puede desbloquear con Face ID o huella? */
export async function hayBiometria() {
  try {
    return Boolean(window.PublicKeyCredential) && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Pide Face ID o huella con una llave ya registrada. true solo si el
 * teléfono verificó a la persona. `corte` permite cancelarlo (al escribir
 * el PIN) y de todos modos se corta solo: nunca se queda esperando para siempre.
 */
export async function pedirBiometria(credencial, corte = new AbortController()) {
  const reloj = setTimeout(() => corte.abort(), TOPE_BIOMETRIA_MS);
  try {
    const cortado = new Promise((_, mal) => corte.signal.addEventListener('abort', () => mal(new Error('cortado')), { once: true }));
    const prueba = await Promise.race([cortado, navigator.credentials.get({
      signal: corte.signal,
      publicKey: {
        challenge: azar(32), timeout: 60000, userVerification: 'required',
        allowCredentials: [{ type: 'public-key', id: deBase64(credencial), transports: ['internal'] }],
      },
    })]);
    return verificado(prueba.response.authenticatorData);
  } finally {
    clearTimeout(reloj);
  }
}

// Siempre el mismo, para que activar otra vez reemplace la llave en vez de dejar otra suelta.
const USUARIO = new TextEncoder().encode('marea-este-telefono');

/** Registra una llave en el teléfono. Devuelve su id, o lanza si no hubo verificación. */
export async function registrarBiometria() {
  const creada = await navigator.credentials.create({
    publicKey: {
      challenge: azar(32), timeout: 60000, attestation: 'none',
      rp: { name: 'Marea' },
      user: { id: USUARIO, name: 'marea', displayName: 'Marea' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    },
  });
  // La propia creación dice si el teléfono verificó a la persona. No se pide
  // una segunda vez: en el iPhone el permiso del toque ya habría caducado.
  const datos = creada.response.getAuthenticatorData?.();
  if (datos && !verificado(datos)) throw new Error('La verificación no se completó.');
  return aBase64(creada.rawId);
}

/**
 * Las reglas de un intento de PIN, compartidas por el candado y por la
 * pantalla que verifica antes de cambiar el bloqueo. `puerta` es
 * { leer, guardar, ahora }. Devuelve { ok } | { espera } | { invalido } |
 * { error } | { mal }.
 */
export function crearIntentos(puerta) {
  // Si guardar el fallo no llega a terminar, el contador igual sube en memoria.
  let memoria = null;
  const actual = () => {
    const b = puerta.leer();
    if (!b) return null;
    return memoria && memoria.fallos > b.fallos ? { ...b, fallos: memoria.fallos, ultimo: memoria.ultimo } : b;
  };
  return {
    /** Cuánto falta para poder probar. También corrige un reloj atrasado. */
    espera() {
      const b = actual();
      if (!b) return 0;
      const alDia = conRelojAlDia(b, puerta.ahora());
      if (alDia !== b) {
        memoria = alDia;
        puerta.guardar((x) => (x ? conRelojAlDia(x, puerta.ahora()) : x)).catch(() => {});
      }
      return esperaPorFallos(alDia, puerta.ahora());
    },
    async probar(texto) {
      const b = actual();
      if (!b) return { ok: true };
      const resto = this.espera();
      if (resto) return { espera: resto };
      if (!pinValido(texto)) return { invalido: true };
      const r = await resultadoPin(texto, b.pin);
      if (r === 'error') return { error: true };
      if (r === 'si') { this.limpiar(); return { ok: true }; }
      memoria = conFallo(b, puerta.ahora());
      await conTope(puerta.guardar((x) => (x ? { ...conFallo(x, puerta.ahora()), fallos: Math.max(x.fallos + 1, memoria.fallos) } : x)), TOPE_GUARDADO_MS);
      const despues = this.espera();
      return despues ? { espera: despues } : { mal: true };
    },
    /** Tras entrar bien (con PIN o con Face ID) los fallos se olvidan. No se espera al guardado. */
    limpiar() {
      memoria = null;
      if (puerta.leer()?.fallos) puerta.guardar((x) => (x ? sinFallos(x) : x)).catch(() => {});
    },
  };
}

/** El texto para cada resultado de un intento. */
export function textoIntento(r) {
  if (r.espera) return `Demasiados intentos. Espera ${textoEspera(r.espera)} y prueba otra vez.`;
  if (r.invalido) return 'El PIN son de 4 a 6 números.';
  if (r.error) return 'El teléfono no pudo comprobar el PIN. Cierra Marea, vuelve a abrirla y prueba otra vez.';
  return 'Ese no es el PIN.';
}

/** Campo de PIN: se ve con puntos, pero no es un campo de contraseña (así el teléfono no ofrece guardarlo). */
export function campoPin(atributos = {}) {
  return el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 6, ...atributos, class: 'oculto ' + (atributos.class ?? '') });
}

/**
 * El candado. `puerta.leer()` da la configuración actual (o null) y
 * `puerta.guardar(fn)` la cambia. `alAbrir()` se llama al desbloquear.
 */
export function crearCandado({ raiz, puerta, alAbrir }) {
  const intentos = crearIntentos(puerta);
  let capa = null;
  let cerrado = false;

  const quitar = () => { capa?.remove(); capa = null; raiz.hidden = false; };
  const poner = (...hijos) => {
    capa?.remove();
    capa = el('section', { class: 'pantalla candado' }, el('h1', { class: 'titulo' }, 'Marea'), ...hijos);
    raiz.hidden = true;
    document.body.append(capa);
  };

  function abrir() {
    cerrado = false;
    quitar();
    alAbrir?.();
  }

  function pedir() {
    const b = puerta.leer();
    if (!b) { abrir(); return; }
    cerrado = true;
    const aviso = el('p', { class: 'error', role: 'alert' });
    const pin = campoPin({ class: 'nota pin', placeholder: 'PIN', 'aria-label': 'PIN' });
    // El PIN y Face ID van por separado: si uno se queda esperando, el otro sigue sirviendo.
    let probandoPin = false;
    let cara = null;

    async function probarPin(evento) {
      evento.preventDefault();
      if (probandoPin) return;
      cara?.abort();
      probandoPin = true;
      try {
        const r = await intentos.probar(pin.value);
        if (r.ok) { abrir(); return; }
        if (!r.invalido) pin.value = '';
        aviso.textContent = textoIntento(r);
      } catch {
        aviso.textContent = textoIntento({ error: true });
      } finally {
        probandoPin = false;
      }
    }

    async function probarCara() {
      if (cara) return;
      cara = new AbortController();
      const esta = cara;
      try {
        if (await pedirBiometria(b.credencial, esta)) { intentos.limpiar(); abrir(); return; }
        aviso.textContent = 'No se pudo verificar. Usa tu PIN.';
      } catch {
        // Cancelar o fallar no es grave: queda el PIN.
        if (!probandoPin) aviso.textContent = 'No se completó. Prueba otra vez o usa tu PIN.';
      } finally {
        if (cara === esta) cara = null;
      }
    }

    poner(
      el('p', { class: 'parrafo' }, 'Está bloqueada. Tus datos siguen aquí.'),
      b.credencial ? el('button', { class: 'boton boton-sec ancho', type: 'button', onclick: probarCara }, 'Usar Face ID o huella') : null,
      el('form', { class: 'candado-pin', novalidate: true, onsubmit: probarPin }, pin, el('button', { class: 'boton boton-pri', type: 'submit' }, 'Entrar')),
      aviso);
    const resto = intentos.espera();
    if (resto) aviso.textContent = textoIntento({ espera: resto });
    if (!b.credencial) pin.focus();
  }

  return {
    /** Pide PIN o Face ID. Sin bloqueo configurado no hace nada. */
    bloquear() { if (puerta.leer()) pedir(); },
    /** Tapa lo que se ve mientras la app está en segundo plano (para el selector de apps). */
    cubrir() { if (puerta.leer() && !cerrado) poner(); },
    /** Vuelve de segundo plano dentro del tiempo de gracia: se destapa sin pedir nada. */
    descubrir() { if (!cerrado) quitar(); },
    estaCerrado: () => cerrado,
  };
}
