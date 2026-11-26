/* Yeni sürüm yayınlarken CACHE adını artır. */
const CACHE = 'mikro-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './css/style.css', './js/core.js', './js/pdf-editor.js', './js/office.js', './js/editors.js'];
const ENGINE_HOSTS = ['cdnjs.cloudflare.com', 'cdn.sheetjs.com'];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mikro-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const store = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (url.origin === location.origin) {
    // Uygulama dosyaları: önce ağ (güncellemeler hemen gelsin), çevrimdışıysa önbellek
    e.respondWith(fetch(req).then(store).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
  } else if (ENGINE_HOSTS.includes(url.hostname)) {
    // Sürümü sabit motorlar: önce önbellek
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(store)));
  }
});
