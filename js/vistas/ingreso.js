// Me entró plata. También sirve para cambiar un ingreso ya guardado.
import { el } from '../dom.js';
import { aCentavos, aBsEnteros, aTexto } from '../dinero.js';
import { resumen } from '../calculo.js';
import { ordenarPorUso, crearGuardador } from '../registro.js';
import { SIN_EXPLICAR } from '../cuadre.js';
import { campoMonto, grupoChips, horaCorta, fechaHora, botonBorrar } from './piezas.js';

export function ingreso(ctx, { mov = null, volver = 'inicio', sugerido = null } = {}) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const r = resumen(cuentas, movimientos, ajustes, ctx.ahora());
  const cuentaInicial = mov?.cuentaId ?? sugerido?.cuentaId ?? (activas.some((c) => c.id === ajustes.ultimaCuentaId) ? ajustes.ultimaCuentaId : activas[0].id);
  const origenes = ordenarPorUso(ajustes.origenes, movimientos, 'origen');
  if (mov && !origenes.includes(mov.origen)) origenes.push(mov.origen);

  const aviso = el('p', { class: 'aviso', 'aria-live': 'polite' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit', disabled: true }, mov ? 'Guardar cambios' : 'Guardar ingreso');

  const monto = campoMonto(actualizar, mov ? aTexto(mov.monto) : (sugerido?.monto ? aTexto(sugerido.monto) : ''));
  const deDonde = grupoChips('¿De dónde?', origenes.map((o) => ({ valor: o, texto: o })), mov?.origen ?? null, actualizar);
  const aDonde = grupoChips('¿A qué cuenta entró?', activas.map((c) => ({ valor: c.id, texto: c.nombre })), cuentaInicial, actualizar);

  function actualizar() {
    const centavos = aCentavos(monto.entrada.value);
    guardarBoton.disabled = centavos === null || deDonde.valor() === null;
    if (centavos === null || mov) { aviso.replaceChildren(); return; }
    if (deDonde.valor() === 'Mensualidad') {
      aviso.replaceChildren('Con tu mensualidad empieza un ciclo nuevo.');
      return;
    }
    const nuevoPorDia = Math.max(0, Math.floor((r.disponible + r.gastadoHoy + centavos) / r.dias));
    aviso.replaceChildren('Con esto puedes gastar ', el('b', {}, `${aBsEnteros(nuevoPorDia)} Bs por día`), '.');
  }

  // Fuera del guardador: si algo falla después de guardar, reintentar no crea otro.
  const idNuevo = crypto.randomUUID();
  const guardar = crearGuardador(async () => {
    const centavos = aCentavos(monto.entrada.value);
    if (centavos === null || deDonde.valor() === null) return;
    const nuevo = {
      ...(mov ?? { id: idNuevo, tipo: 'ingreso', fecha: ctx.ahora(), nota: '' }),
      monto: centavos, cuentaId: aDonde.valor(), origen: deDonde.valor(),
    };
    // Si a un ajuste de cuadre se le pone de dónde vino, ya es un ingreso normal.
    if (nuevo.ajuste && nuevo.origen !== SIN_EXPLICAR) delete nuevo.ajuste;
    await ctx.almacen.agregarMovimiento(nuevo);
    await ctx.recargar();
    ctx.deshacer = mov
      ? { texto: 'Cambios guardados.', accion: () => ctx.almacen.agregarMovimiento(mov) }
      : { texto: 'Ingreso guardado.', accion: () => ctx.almacen.borrarMovimiento(nuevo.id) };
    ctx.ir(volver);
  }, () => {
    aviso.replaceChildren(el('b', { class: 'pasa' }, 'No se pudo guardar.'), ' Cierra Marea, vuelve a abrirla e inténtalo otra vez.');
  });

  actualizar();
  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir(volver) }, 'Cancelar'),
      el('span', {}, mov ? fechaHora(mov.fecha, ctx.ahora()) : horaCorta(ctx.ahora()))),
    monto.nodo, deDonde.nodo, aDonde.nodo,
    mov ? el('div', { class: 'borrar' }, botonBorrar(ctx, mov, volver)) : null,
    el('div', { class: 'pie pie-fijo' }, aviso, guardarBoton));
}
