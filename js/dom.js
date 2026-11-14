// Ayudante para crear elementos. Los textos entran siempre como nodos de
// texto, nunca como HTML, así lo que escribe la persona no puede ejecutarse.

export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos ?? {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave.startsWith('on') && typeof valor === 'function') nodo.addEventListener(clave.slice(2), valor);
    else if (clave === 'class') nodo.className = valor;
    else nodo.setAttribute(clave, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}
