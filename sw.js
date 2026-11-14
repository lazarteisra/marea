// Guarda la app en el teléfono para que funcione sin internet.
// CACHE y ARCHIVOS los escribe herramientas/sellar.mjs; no editarlos a mano.
// Solo guarda archivos de la app; los datos de la persona nunca pasan por aquí.

const CACHE = 'marea-ae207d9414';
const ARCHIVOS = [
  "./",
  "css/marea.css",
  "fonts/bodoni-moda.woff2",
  "fonts/hanken-grotesk.woff2",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "index.html",
  "js/almacen.js",
  "js/app.js",
  "js/calculo.js",
  "js/dinero.js",
  "js/dom.js",
  "js/fechas.js",
  "js/registro.js",
  "js/respaldo.js",
  "js/vistas/ajustes.js",
  "js/vistas/ingreso.js",
  "js/vistas/inicio.js",
  "js/vistas/piezas.js",
  "js/vistas/primeraVez.js",
  "js/vistas/registrar.js",
  "manifest.webmanifest"
];

self.addEventListener('install', (evento) => {
  // Se baja todo de nuevo, saltando la caché del navegador, y solo si todo
  // llega bien se activa: la app nunca queda con archivos de dos versiones.
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS.map((ruta) => new Request(ruta, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c.startsWith('marea-') && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

// Primero lo guardado; la red solo para lo que no esté.
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(pedido, { ignoreSearch: true });
    if (guardado) return guardado;
    try {
      return await fetch(pedido);
    } catch {
      if (pedido.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
      return Response.error();
    }
  })());
});
