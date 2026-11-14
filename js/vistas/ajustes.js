// Ajustes: día de la mensualidad y respaldo de los datos.
import { el } from '../dom.js';
import { exportar, validarRespaldo } from '../respaldo.js';
import { claveDia } from '../fechas.js';
import { datosVacios } from '../almacen.js';

const TAM_MAX = 5 * 1024 * 1024;

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
    await ctx.almacen.guardarAjustes({ ...ctx.estado.ajustes, diaMensualidad: n });
    await ctx.recargar();
    estadoDia.textContent = 'Guardado.';
  });

  // --- respaldo ---
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
          await ctx.almacen.reemplazarTodo(resultado.datos);
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
          await ctx.almacen.reemplazarTodo(datosVacios());
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
      el('h2', {}, 'Respaldo'),
      el('p', {}, 'Tus datos viven solo en este teléfono. Guarda una copia de vez en cuando para no perderlos.'),
      el('button', { class: 'boton boton-sec', type: 'button', onclick: exportarDatos }, 'Exportar mis datos'),
      el('button', { class: 'boton boton-sec', type: 'button', onclick: () => selector.click() }, 'Importar datos'),
      selector, estado),

    el('div', { class: 'seccion' },
      el('h2', {}, 'Empezar de cero'),
      el('p', {}, 'Borra todo y vuelve a pedirte tus saldos. Si quieres conservar lo que hay, exporta una copia antes.'),
      el('button', { class: 'boton boton-sec', type: 'button', onclick: pedirBorrado }, 'Borrar todos mis datos'),
      estadoCero));
}
