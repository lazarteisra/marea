// Ajustes: día de la mensualidad, bloqueo y respaldo de los datos.
import { el } from '../dom.js';
import { exportar, validarRespaldo } from '../respaldo.js';
import { claveDia } from '../fechas.js';
import { datosVacios } from '../almacen.js';
import { estadoCopia } from '../bloqueo.js';
import { hayBiometria, registrarBiometria } from './candado.js';

const TAM_MAX = 5 * 1024 * 1024;

/** "Tu última copia fue hace 9 días. Ya conviene hacer otra." Pura, para poder probarla. */
export function textoCopia(e) {
  if (e.dias === null) return e.toca ? 'Todavía no guardaste ninguna copia. Conviene hacer una.' : 'Todavía no guardaste ninguna copia.';
  const cuando = e.dias === 0 ? 'hoy' : e.dias === 1 ? 'ayer' : `hace ${e.dias} días`;
  return `Tu última copia fue ${cuando}.` + (e.toca ? ' Ya conviene hacer otra.' : '');
}

export function ajustes(ctx) {
  const { ajustes: actuales } = ctx.estado;

  // --- mensualidad ---
  const estadoDia = el('p', { class: 'estado', 'aria-live': 'polite' });
  const dia = el('input', { id: 'dia-mensualidad', inputmode: 'numeric', autocomplete: 'off', maxlength: 2, value: actuales.diaMensualidad });
  dia.addEventListener('change', async () => {
    const n = Number(dia.value.trim());
    if (!/^\d{1,2}$/.test(dia.value.trim()) || n < 1 || n > 28) {
      estadoDia.textContent = 'Escribe un día entre 1 y 28.';
      dia.value = ctx.estado.ajustes.diaMensualidad;
      return;
    }
    await ctx.almacen.actualizarAjustes((a) => ({ ...a, diaMensualidad: n }));
    await ctx.recargar();
    estadoDia.textContent = 'Guardado.';
  });

  // --- bloqueo ---
  const bloqueo = actuales.bloqueo;
  const estadoBloqueo = el('p', { class: 'estado', 'aria-live': 'polite' });
  const cara = el('button', { class: 'boton boton-sec', type: 'button', hidden: true }, bloqueo?.credencial ? 'Quitar Face ID o huella' : 'Activar Face ID o huella');
  const cambiarBloqueo = async (cambio) => {
    await ctx.almacen.actualizarAjustes((a) => (a.bloqueo ? { ...a, bloqueo: cambio(a.bloqueo) } : a));
    await ctx.recargar();
    ctx.ir('ajustes');
  };
  if (bloqueo) {
    // Solo se ofrece si el teléfono puede; quitarlo siempre se puede.
    if (bloqueo.credencial) cara.hidden = false; else hayBiometria().then((hay) => { cara.hidden = !hay; });
    let ocupado = false;
    cara.addEventListener('click', async () => {
      // Quitarlo cambia quién puede entrar: antes hay que confirmar que es el dueño.
      if (bloqueo.credencial) {
        ctx.ir('verificar', { titulo: 'Quitar Face ID o huella', alVerificar: () => cambiarBloqueo((b) => ({ ...b, credencial: null })) });
        return;
      }
      if (ocupado) return;
      ocupado = true;
      try {
        const credencial = await registrarBiometria();
        await cambiarBloqueo((b) => ({ ...b, credencial }));
      } catch {
        estadoBloqueo.textContent = 'No se pudo activar. Tu PIN sigue funcionando igual.';
      } finally {
        ocupado = false;
      }
    });
  }
  const quitarBloqueo = el('button', { class: 'enlace peligro', type: 'button', onclick: () => ctx.ir('verificar', {
    titulo: 'Quitar el bloqueo',
    alVerificar: async () => {
      await ctx.almacen.actualizarAjustes((a) => ({ ...a, bloqueo: null }));
      await ctx.recargar();
      ctx.ir('ajustes');
    },
  }) }, 'Quitar el bloqueo');

  // --- respaldo ---
  const copiaAhora = estadoCopia(actuales, ctx.estado.movimientos.length > 0, ctx.ahora());
  const copia = el('p', { class: copiaAhora.toca ? 'toca' : null }, textoCopia(copiaAhora));
  const estado = el('div', { class: 'estado', 'aria-live': 'polite' });
  const decir = (...nodos) => estado.replaceChildren(...nodos);

  async function exportarDatos() {
    const nombre = `marea-${claveDia(ctx.ahora())}.json`;
    const texto = exportar(ctx.estado, ctx.ahora());
    const archivo = new File([texto], nombre, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo] });
      } else {
        const url = URL.createObjectURL(archivo);
        const enlace = el('a', { href: url, download: nombre });
        document.body.append(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      // Se anota cuándo fue, para avisar cuando ya convenga hacer otra.
      await ctx.almacen.actualizarAjustes((a) => ({ ...a, ultimaCopia: ctx.ahora() })).then(() => ctx.recargar()).catch(() => {});
      copia.textContent = textoCopia(estadoCopia(ctx.estado.ajustes, ctx.estado.movimientos.length > 0, ctx.ahora()));
      copia.classList.remove('toca');
      decir(`Copia lista: ${nombre}. Guárdala en un lugar tuyo y no la envíes por chat: contiene todos tus movimientos.`);
    } catch (error) {
      if (error?.name !== 'AbortError') decir('No se pudo exportar. Inténtalo otra vez.');
    }
  }

  const selector = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  selector.addEventListener('change', async () => {
    const archivo = selector.files[0];
    selector.value = '';
    if (!archivo) return;
    if (archivo.size > TAM_MAX) { decir('El archivo es demasiado grande.'); return; }
    let resultado;
    try { resultado = validarRespaldo(await archivo.text()); } catch { resultado = { ok: false, motivo: 'No se pudo leer el archivo.' }; }
    if (!resultado.ok) { decir(resultado.motivo + ' Tus datos no cambiaron.'); return; }
    const cuantos = resultado.datos.movimientos.length;
    decir(
      el('p', {}, `Este respaldo tiene ${cuantos} ${cuantos === 1 ? 'movimiento' : 'movimientos'}. Importarlo reemplaza todo lo que hay ahora en este teléfono.`),
      el('button', { class: 'boton boton-sec', type: 'button', onclick: async () => {
        try {
          // El bloqueo es de este teléfono: importar una copia no lo quita ni lo cambia.
          const ajustes = { ...resultado.datos.ajustes, bloqueo: ctx.estado.ajustes.bloqueo ?? null };
          await ctx.almacen.reemplazarTodo({ ...resultado.datos, ajustes });
          await ctx.recargar();
          decir('Datos importados.');
        } catch {
          decir('No se pudo importar. Tus datos no cambiaron.');
        }
      } }, 'Reemplazar mis datos'),
      el('button', { class: 'enlace', type: 'button', onclick: () => decir('No se importó nada.') }, 'Cancelar'));
  });

  // --- empezar de cero ---
  const estadoCero = el('div', { class: 'estado', 'aria-live': 'polite' });
  function pedirBorrado() {
    estadoCero.replaceChildren(
      el('p', {}, '¿Seguro? Se borran todos tus movimientos y saldos de este teléfono y no se puede deshacer.'),
      el('button', { class: 'boton boton-sec', type: 'button', onclick: async () => {
        try {
          // La cerradura es del teléfono, no de los datos: se queda puesta.
          const vacios = datosVacios();
          await ctx.almacen.reemplazarTodo({ ...vacios, ajustes: { ...vacios.ajustes, bloqueo: ctx.estado.ajustes.bloqueo ?? null } });
          await ctx.recargar();
          ctx.ir('primeraVez');
        } catch {
          estadoCero.replaceChildren('No se pudo borrar. Tus datos no cambiaron.');
        }
      } }, 'Sí, borrar todo'),
      el('button', { class: 'enlace', type: 'button', onclick: () => estadoCero.replaceChildren('No se borró nada.') }, 'Cancelar'));
  }

  return el('section', { class: 'pantalla' },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('inicio') }, 'Volver')),
    el('h1', { class: 'titulo chico' }, 'Ajustes'),

    el('div', { class: 'seccion' },
      el('h2', {}, 'Mensualidad'),
      el('p', {}, 'El día del mes en que suele llegar. El ciclo nuevo empieza cuando registras el ingreso "Mensualidad".'),
      el('div', { class: 'campos' },
        el('div', { class: 'campo' }, el('label', { for: dia.id }, 'Día esperado'), dia)),
      estadoDia),

    el('div', { class: 'seccion' },
      el('h2', {}, 'Bloqueo'),
      bloqueo
        ? el('p', {}, bloqueo.credencial ? 'Activado, con PIN y con Face ID o huella.' : 'Activado, con PIN.')
        : el('p', {}, 'Para que nadie que agarre tu teléfono vea tus gastos. Marea pide un PIN al abrirla y, si quieres, Face ID.'),
      el('button', { class: 'boton boton-sec', type: 'button', onclick: () => ctx.ir('pin') }, bloqueo ? 'Cambiar el PIN' : 'Poner un PIN'),
      bloqueo ? cara : null,
      bloqueo ? quitarBloqueo : null,
      estadoBloqueo),

    el('div', { class: 'seccion' },
      el('h2', {}, 'Respaldo'),
      el('p', {}, 'Tus datos viven solo en este teléfono. Guarda una copia de vez en cuando para no perderlos.'),
      copia,
      el('button', { class: 'boton boton-sec', type: 'button', onclick: exportarDatos }, 'Exportar mis datos'),
      el('button', { class: 'boton boton-sec', type: 'button', onclick: () => selector.click() }, 'Importar datos'),
      selector, estado),

    el('div', { class: 'seccion' },
      el('h2', {}, 'Empezar de cero'),
      el('p', {}, 'Borra todo y vuelve a pedirte tus saldos. Si quieres conservar lo que hay, exporta una copia antes. El bloqueo, si lo tienes, se queda puesto.'),
      el('button', { class: 'boton boton-sec', type: 'button', onclick: pedirBorrado }, 'Borrar todos mis datos'),
      estadoCero));
}
