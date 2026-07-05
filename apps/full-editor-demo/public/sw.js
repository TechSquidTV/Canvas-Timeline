globalThis.addEventListener('install', () => {
  globalThis.skipWaiting();
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(globalThis.clients.claim());
});
