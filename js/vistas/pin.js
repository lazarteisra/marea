// Poner o cambiar el PIN del bloqueo, y verificar a la persona antes de
// cambiar o quitar la cerradura.
import { el } from '../dom.js';
import { pinValido, crearPin, comprobarPin } from '../bloqueo.js';
import { crearGuardador } from '../registro.js';
import { campoPin, crearIntentos, textoIntento, pedirBiometria } from './candado.js';

/**
 * Pide el PIN actual (o Face ID) antes de tocar el bloqueo. Sin esto, quien
 * agarrara el teléfono con Marea abierta podría poner su propio PIN y dejar
 * fuera al dueño. `alVerificar` se llama solo si la persona se verificó.
 */
export function verificar(ctx, { titulo, alVerificar }) {
  const b = ctx.estado.ajustes.bloqueo;
  if (!b) { return el('section', { class: 'pantalla' }, el('p', { class: 'parrafo' }, 'No hay bloqueo puesto.'), el('button', { class: 'boton boton-sec', type: 'button', onclick: () => ctx.ir('ajustes') }, 'Volver')); }
  const intentos = crearIntentos(ctx.puerta);
  const aviso = el('p', { class: 'error', role: 'alert' });
  const actual = campoPin({ id: 'pin-actual', class: 'campo-pin', placeholder: '••••', 'aria-label': 'PIN actual', 'data-foco': true });
  let probando = false;
  let cara = null;

  async function conPin(evento) {
    evento.preventDefault();
    if (probando) return;
    cara?.abort();
    probando = true;
    try {
      const r = await intentos.probar(actual.value);
      if (r.ok) { await alVerificar(); return; }
      if (!r.invalido) actual.value = '';
      aviso.textContent = textoIntento(r);
    } catch {
      aviso.textContent = 'No se pudo completar. Inténtalo otra vez.';
    } finally {
      probando = false;
    }
  }

  async function conCara() {
    if (cara) return;
    cara = new AbortController();
    const esta = cara;
    try {
      if (await pedirBiometria(b.credencial, esta)) { intentos.limpiar(); await alVerificar(); return; }
      aviso.textContent = 'No se pudo verificar. Usa tu PIN.';
    } catch {
      if (!probando) aviso.textContent = 'No se completó. Prueba otra vez o usa tu PIN.';
    } finally {
      if (cara === esta) cara = null;
    }
  }

  const resto = intentos.espera();
  if (resto) aviso.textContent = textoIntento({ espera: resto });
  return el('form', { class: 'pantalla', novalidate: true, onsubmit: conPin },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => { cara?.abort(); ctx.ir('ajustes'); } }, 'Cancelar'),
      el('span', {}, 'Bloqueo')),
    el('h1', { class: 'titulo chico' }, titulo),
    el('p', { class: 'parrafo' }, 'Antes, confirma que eres tú.'),
    el('div', { class: 'campos' }, el('div', { class: 'campo' }, el('label', { for: 'pin-actual' }, 'Tu PIN actual'), actual)),
    aviso,
    b.credencial ? el('button', { class: 'boton boton-sec ancho', type: 'button', onclick: conCara }, 'Usar Face ID o huella') : null,
    el('div', { class: 'pie pie-fijo' }, el('button', { class: 'boton boton-pri', type: 'submit' }, 'Continuar')));
}

export function pin(ctx, { verificado = false } = {}) {
  const tenia = Boolean(ctx.estado.ajustes.bloqueo);
  if (tenia && !verificado) return verificar(ctx, { titulo: 'Cambiar el PIN', alVerificar: () => ctx.ir('pin', { verificado: true }) });

  const error = el('p', { class: 'error', role: 'alert' });
  const campo = (id, etiqueta) => campoPin({ id, class: 'campo-pin', placeholder: '••••', 'aria-label': etiqueta, oninput: () => { error.textContent = ''; } });
  const uno = campo('pin-uno', 'PIN nuevo');
  const dos = campo('pin-dos', 'Repite el PIN');
  uno.setAttribute('data-foco', '');

  const guardar = crearGuardador(async () => {
    if (!pinValido(uno.value)) { error.textContent = 'El PIN son de 4 a 6 números.'; uno.focus(); return; }
    if (uno.value !== dos.value) { error.textContent = 'Los dos PIN no son iguales. Escríbelos otra vez.'; dos.value = ''; dos.focus(); return; }
    let nuevo;
    try {
      nuevo = await crearPin(uno.value);
      // Antes de cerrar nada, se comprueba que con lo guardado ese PIN abre.
      if (!await comprobarPin(uno.value, nuevo) || !await comprobarPin(uno.value, JSON.parse(JSON.stringify(nuevo)))) throw new Error('El PIN no se pudo comprobar.');
      await ctx.almacen.actualizarAjustes((a) => ({ ...a, bloqueo: { pin: nuevo, credencial: a.bloqueo?.credencial ?? null, fallos: 0, ultimo: 0 } }));
    } catch {
      error.textContent = 'No se pudo guardar el PIN. No cambió nada: inténtalo otra vez.';
      return;
    }
    // Desde aquí el PIN nuevo ya rige, aunque falle volver a leer los datos.
    try { await ctx.recargar(); } catch { /* se verá al volver a abrir */ }
    ctx.ir('ajustes');
  }, () => { error.textContent = 'Algo falló al terminar. Cierra Marea y vuelve a abrirla: tu PIN nuevo ya está guardado.'; });

  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('ajustes') }, 'Cancelar'),
      el('span', {}, 'Bloqueo')),
    el('h1', { class: 'titulo chico' }, tenia ? 'Tu PIN nuevo' : 'Poner un PIN'),
    el('p', { class: 'parrafo' }, 'De 4 a 6 números. Marea lo va a pedir al abrirla y al volver tras 2 minutos fuera.'),
    el('div', { class: 'campos' },
      el('div', { class: 'campo' }, el('label', { for: 'pin-uno' }, 'PIN nuevo'), uno),
      el('div', { class: 'campo' }, el('label', { for: 'pin-dos' }, 'Repítelo'), dos)),
    error,
    el('p', { class: 'vacio' }, 'Si olvidas el PIN y no tienes Face ID activado, no hay forma de entrar: tendrías que borrar la app y recuperar tus datos de una copia. Guarda una copia antes.'),
    el('div', { class: 'pie pie-fijo' }, el('button', { class: 'boton boton-pri', type: 'submit' }, 'Guardar PIN')));
}
