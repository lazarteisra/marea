// Me entró plata.
import { el } from '../dom.js';
import { aCentavos, aBsEnteros } from '../dinero.js';
import { resumen } from '../calculo.js';
import { ordenarPorUso, crearGuardador } from '../registro.js';
import { campoMonto, grupoChips, horaCorta } from './piezas.js';

export function ingreso(ctx) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const r = resumen(cuentas, movimientos, ajustes, ctx.ahora());
  const cuentaInicial = activas.some((c) => c.id === ajustes.ultimaCuentaId) ? ajustes.ultimaCuentaId : activas[0].id;

  const aviso = el('p', { class: 'aviso', 'aria-live': 'polite' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit', disabled: true }, 'Guardar ingreso');

  const monto = campoMonto(actualizar);
  const deDonde = grupoChips('¿De dónde?', ordenarPorUso(ajustes.origenes, movimientos, 'origen').map((o) => ({ valor: o, texto: o })), null, actualizar);
  const aDonde = grupoChips('¿A qué cuenta entró?', activas.map((c) => ({ valor: c.id, texto: c.nombre })), cuentaInicial, actualizar);

  function actualizar() {
    const centavos = aCentavos(monto.entrada.value);
    guardarBoton.disabled = centavos === null || deDonde.valor() === null;
    if (centavos === null) { aviso.replaceChildren(); return; }
    if (deDonde.valor() === 'Mensualidad') {
      aviso.replaceChildren('Con tu mensualidad empieza un ciclo nuevo.');
      return;
    }
    const nuevoPorDia = Math.max(0, Math.floor((r.disponible + r.gastadoHoy + centavos) / r.dias));
    aviso.replaceChildren('Con esto puedes gastar ', el('b', {}, `${aBsEnteros(nuevoPorDia)} Bs por día`), '.');
  }

  const guardar = crearGuardador(async () => {
    const centavos = aCentavos(monto.entrada.value);
    if (centavos === null || deDonde.valor() === null) return;
    const mov = {
      id: crypto.randomUUID(), tipo: 'ingreso', monto: centavos, cuentaId: aDonde.valor(), fecha: ctx.ahora(),
      origen: deDonde.valor(), nota: '',
    };
    await ctx.almacen.agregarMovimiento(mov);
    await ctx.recargar();
    ctx.deshacer = { texto: 'Ingreso guardado.', accion: () => ctx.almacen.borrarMovimiento(mov.id) };
    ctx.ir('inicio');
  }, () => {
    aviso.replaceChildren(el('b', { class: 'pasa' }, 'No se pudo guardar.'), ' Cierra Marea, vuelve a abrirla e inténtalo otra vez.');
  });

  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('inicio') }, 'Cancelar'),
      el('span', {}, horaCorta(ctx.ahora()))),
    monto.nodo, deDonde.nodo, aDonde.nodo,
    el('div', { class: 'pie' }, aviso, guardarBoton));
}
