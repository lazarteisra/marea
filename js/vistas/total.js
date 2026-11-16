// Total: toda tu plata junta, cómo cambia, tus cuentas y quién te debe.
// También las pantallas para pasar plata entre cuentas, prestar y cobrar.
import { el, svg } from '../dom.js';
import { aCentavos, aTexto, aBsEnteros } from '../dinero.js';
import { saldos } from '../calculo.js';
import { deudas } from '../deudas.js';
import { serieTotal, tramo } from '../total.js';
import { estadoCuadre, borradorVigente } from '../cuadre.js';
import { textoEstadoCuadre } from './cuadrar.js';
import { crearGuardador } from '../registro.js';
import { campoMonto, grupoChips, avisoDeshacer, botonBorrar, horaCorta, fechaHora } from './piezas.js';

const RANGOS = [{ dias: 30, texto: '1 mes', hace: 'hace un mes' }, { dias: 182, texto: '6 meses', hace: 'hace seis meses' }, { dias: null, texto: 'Todo', hace: null }];

const diaCorto = (clave) => {
  const [a, m, d] = clave.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(a, m - 1, d));
};

/** "120 Bs más que hace un mes" o "… que el 14 nov" si aún no hay tanta historia. Pura. */
export function textoCambio(t, rango) {
  const completo = rango.dias !== null && t.puntos.length === rango.dias + 1;
  const referencia = completo ? rango.hace : `el ${diaCorto(t.desde)}`;
  if (t.puntos.length < 2) return 'Mañana vas a ver cómo cambió.';
  if (t.cambio === 0) return `Igual que ${referencia}.`;
  return `${aTexto(Math.abs(t.cambio))} Bs ${t.cambio > 0 ? 'más' : 'menos'} que ${referencia}.`;
}

/** Puntos "x,y" de la línea del total, ajustada entre su mínimo y su máximo. Pura. */
export function puntosTotal(valores, ancho, alto) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min;
  const x = (i) => (valores.length === 1 ? ancho : (i / (valores.length - 1)) * ancho);
  const y = (v) => (rango === 0 ? alto / 2 : alto - ((v - min) / rango) * alto);
  const puntos = valores.map((v, i) => [x(i), y(v)]);
  if (puntos.length === 1) puntos.unshift([0, puntos[0][1]]);
  return puntos.map(([a, b]) => `${+a.toFixed(1)},${+b.toFixed(1)}`).join(' ');
}

const ANCHO = 300;
const ALTO = 84;

function graficoTotal(puntos) {
  const linea = puntosTotal(puntos.map((p) => p.total), ANCHO, ALTO);
  const [fx, fy] = linea.split(' ').at(-1).split(',');
  return svg('svg', { class: 'grafico', viewBox: `0 -6 ${ANCHO} ${ALTO + 12}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Cómo cambió tu total' },
    svg('polyline', { class: 'g-ahora', points: linea }),
    svg('circle', { class: 'g-punto', cx: fx, cy: fy, r: 3.5 }));
}

export function total(ctx) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const porCuenta = saldos(cuentas, movimientos);
  const d = deudas(movimientos);
  const serie = serieTotal(cuentas, movimientos, ajustes, ctx.ahora());
  const ahora = serie.at(-1).total;
  const cuadre = estadoCuadre(ajustes, ctx.ahora());
  const numero = (ahora < 0 ? '−' : '') + aBsEnteros(Math.abs(ahora));

  let rango = RANGOS[0];
  const cambio = el('p', { class: 'resto', 'aria-live': 'polite' });
  const dibujo = el('div');
  const botones = RANGOS.map((r) => el('button', { class: 'chip chip-mini', type: 'button', 'aria-pressed': String(r === rango) }, r.texto));
  function pintar() {
    const t = tramo(serie, rango.dias);
    cambio.textContent = textoCambio(t, rango);
    dibujo.replaceChildren(graficoTotal(t.puntos),
      el('p', { class: 'g-eje' }, el('span', {}, diaCorto(t.desde)), el('span', {}, 'Hoy')));
  }
  botones.forEach((boton, i) => boton.addEventListener('click', () => {
    rango = RANGOS[i];
    botones.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
    pintar();
  }));
  pintar();

  return el('section', { class: 'pantalla' },
    el('h1', { class: 'titulo chico' }, 'Total'),
    el('p', { class: 'frase' }, d.total > 0 ? 'Tienes en total, con lo que te deben' : 'Tienes en total'),
    el('p', { class: 'num medio' }, numero, el('span', { class: 'bs' }, 'Bs')),
    cambio,
    dibujo,
    el('div', { class: 'chips rangos', role: 'group', 'aria-label': 'Periodo' }, botones),
    avisoDeshacer(ctx, 'total'),

    el('section', { class: 'bloque' },
      el('h2', { class: 'bloque-titulo' }, 'Tus cuentas'),
      el('div', { class: 'cuentas' }, activas.map((c) =>
        el('div', { class: 'cta' }, el('span', {}, c.nombre), el('b', {}, aTexto(porCuenta.get(c.id)))))),
      el('p', { class: 'vacio' + (cuadre.recordar && cuadre.dias !== null ? ' toca' : '') }, textoEstadoCuadre(cuadre)),
      el('button', { class: 'boton boton-sec agregar', type: 'button', onclick: () => ctx.ir('cuadrar') },
        borradorVigente(ajustes, cuentas, ctx.ahora()) ? 'Seguir cuadrando' : 'Cuadrar'),
      activas.length > 1
        ? el('button', { class: 'boton boton-sec agregar', type: 'button', onclick: () => ctx.ir('paso') }, 'Pasar plata entre cuentas')
        : null),

    el('section', { class: 'bloque' },
      el('h2', { class: 'bloque-titulo' }, 'Te deben'),
      d.lista.length
        ? el('div', { class: 'cuentas' }, d.lista.map((p) => el('div', { class: 'deudor' },
          el('span', {}, el('b', {}, p.persona), el('small', {}, `te debe ${aTexto(p.debe)} Bs`)),
          el('button', { class: 'chip', type: 'button', onclick: () => ctx.ir('cobro', { persona: p.persona, debe: p.debe }) }, 'Me pagó'))))
        : el('p', { class: 'vacio' }, 'Nadie te debe. Si pagas algo por alguien, al registrar el gasto elige "Me lo devuelven".'),
      el('button', { class: 'boton boton-sec agregar', type: 'button', onclick: () => ctx.ir('prestamo') }, 'Presté plata')));
}

/** Armazón común de las tres pantallas de abajo: guardar con deshacer, cancelar y borrar. */
function formulario(ctx, { mov, volver, titulo, botonTexto, cuerpo, aviso, guardarBoton, armar, hecho }) {
  const idNuevo = crypto.randomUUID();
  const guardar = crearGuardador(async () => {
    const campos = armar();
    if (!campos) return;
    const nuevo = { ...(mov ?? { id: idNuevo, fecha: ctx.ahora(), nota: '' }), ...campos };
    await ctx.almacen.agregarMovimiento(nuevo);
    await ctx.recargar();
    ctx.deshacer = mov
      ? { texto: 'Cambios guardados.', accion: () => ctx.almacen.agregarMovimiento(mov) }
      : { texto: hecho, accion: () => ctx.almacen.borrarMovimiento(nuevo.id) };
    ctx.ir(volver);
  }, () => {
    aviso.replaceChildren(el('b', { class: 'pasa' }, 'No se pudo guardar.'), ' Cierra Marea, vuelve a abrirla e inténtalo otra vez.');
  });
  guardarBoton.textContent = mov ? 'Guardar cambios' : botonTexto;
  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir(volver) }, 'Cancelar'),
      el('span', {}, mov ? fechaHora(mov.fecha, ctx.ahora()) : titulo ?? horaCorta(ctx.ahora()))),
    cuerpo,
    mov ? el('div', { class: 'borrar' }, botonBorrar(ctx, mov, volver)) : null,
    el('div', { class: 'pie pie-fijo' }, aviso, guardarBoton));
}

const cuentaPreferida = (activas, ajustes) => (activas.some((c) => c.id === ajustes.ultimaCuentaId) ? ajustes.ultimaCuentaId : activas[0].id);

/** Pasar plata de una cuenta a otra (por ejemplo, sacar efectivo del banco). */
export function paso(ctx, { mov = null, volver = 'total', sugerido = null } = {}) {
  const { cuentas } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const opciones = activas.map((c) => ({ valor: c.id, texto: c.nombre }));
  const aviso = el('p', { class: 'aviso', 'aria-live': 'polite' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit', disabled: true });

  const monto = campoMonto(actualizar, mov ? aTexto(mov.monto) : (sugerido?.monto ? aTexto(sugerido.monto) : ''));
  const de = grupoChips('¿De dónde sale?', opciones, mov?.cuentaId ?? sugerido?.de ?? null, actualizar);
  const a = grupoChips('¿A dónde entra?', opciones, mov?.cuentaDestinoId ?? sugerido?.a ?? null, actualizar);

  function leer() {
    const centavos = aCentavos(monto.entrada.value);
    const completo = centavos !== null && de.valor() !== null && a.valor() !== null;
    return { centavos, completo, distintas: de.valor() !== a.valor() };
  }
  function actualizar() {
    const { completo, distintas } = leer();
    guardarBoton.disabled = !completo || !distintas;
    aviso.textContent = completo && !distintas ? 'Elige dos cuentas distintas.' : 'Pasar plata no cuenta como gasto ni como ingreso.';
  }
  actualizar();
  return formulario(ctx, {
    mov, volver, titulo: 'Paso entre cuentas', botonTexto: 'Guardar paso', aviso, guardarBoton, hecho: 'Paso guardado.',
    cuerpo: [monto.nodo, de.nodo, a.nodo],
    armar: () => {
      const { centavos, completo, distintas } = leer();
      return completo && distintas ? { tipo: 'paso', monto: centavos, cuentaId: de.valor(), cuentaDestinoId: a.valor() } : null;
    },
  });
}

/** Prestar plata directamente (no ligada a una compra). */
export function prestamo(ctx, { mov = null, volver = 'total', sugerido = null } = {}) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const aviso = el('p', { class: 'aviso', 'aria-live': 'polite' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit', disabled: true });

  const monto = campoMonto(actualizar, mov ? aTexto(mov.monto) : (sugerido?.monto ? aTexto(sugerido.monto) : ''));
  const persona = el('input', { class: 'nota', maxlength: 40, placeholder: 'Nombre', 'aria-label': '¿A quién le prestaste?', autocomplete: 'off', enterkeyhint: 'done', value: mov?.persona || null, oninput: actualizar });
  const conocidos = el('div', { class: 'chips chips-mini' }, deudas(movimientos).recientes.slice(0, 6).map((nombre) =>
    el('button', { class: 'chip chip-mini', type: 'button', onclick: () => { persona.value = nombre; actualizar(); } }, nombre)));
  const de = grupoChips('¿De qué cuenta salió?', activas.map((c) => ({ valor: c.id, texto: c.nombre })), mov?.cuentaId ?? sugerido?.cuentaId ?? cuentaPreferida(activas, ajustes), actualizar);

  function actualizar() {
    guardarBoton.disabled = aCentavos(monto.entrada.value) === null || persona.value.trim() === '';
    aviso.textContent = 'No cuenta como gasto: queda anotado en "Te deben" hasta que te pague.';
  }
  actualizar();
  return formulario(ctx, {
    mov, volver, titulo: 'Presté plata', botonTexto: 'Guardar préstamo', aviso, guardarBoton, hecho: 'Préstamo guardado.',
    cuerpo: [monto.nodo, el('div', {}, el('h2', { class: 'preg' }, '¿A quién le prestaste?'), persona, conocidos), de.nodo],
    armar: () => {
      const centavos = aCentavos(monto.entrada.value);
      const quien = persona.value.trim().slice(0, 40);
      return centavos !== null && quien ? { tipo: 'prestamo', monto: centavos, cuentaId: de.valor(), persona: quien } : null;
    },
  });
}

/** "Me pagó": viene con todo lo que debe; si pagó una parte, se baja el monto. */
export function cobro(ctx, { mov = null, persona = null, debe = 0, volver = 'total', sugerido = null } = {}) {
  const { cuentas, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const quien = mov?.persona ?? persona;
  const aviso = el('p', { class: 'aviso', 'aria-live': 'polite' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit', disabled: true });

  // Desde Cuadrar llega cuánto sobró: se propone eso, sin pasar de lo que debe.
  const propuesto = sugerido?.monto ? Math.min(sugerido.monto, debe > 0 ? debe : sugerido.monto) : debe;
  const monto = campoMonto(actualizar, mov ? aTexto(mov.monto) : (propuesto > 0 ? aTexto(propuesto) : ''));
  const a = grupoChips('¿A qué cuenta entró?', activas.map((c) => ({ valor: c.id, texto: c.nombre })), mov?.cuentaId ?? sugerido?.cuentaId ?? cuentaPreferida(activas, ajustes), actualizar);

  function actualizar() {
    const centavos = aCentavos(monto.entrada.value);
    guardarBoton.disabled = centavos === null;
    if (centavos === null || mov) { aviso.replaceChildren(); return; }
    aviso.textContent = centavos < debe ? `${quien} te quedaría debiendo ${aTexto(debe - centavos)} Bs.`
      : centavos > debe ? `Te debía ${aTexto(debe)} Bs. Los ${aTexto(centavos - debe)} de más cuentan como plata que te entró.` : `Con esto ${quien} ya no te debe nada.`;
  }
  actualizar();
  return formulario(ctx, {
    mov, volver, titulo: `${quien} te paga`, botonTexto: 'Guardar pago', aviso, guardarBoton, hecho: `Pago de ${quien} guardado.`,
    cuerpo: [monto.nodo, a.nodo],
    armar: () => {
      const centavos = aCentavos(monto.entrada.value);
      return centavos !== null ? { tipo: 'cobro', monto: centavos, cuentaId: a.valor(), persona: quien } : null;
    },
  });
}
