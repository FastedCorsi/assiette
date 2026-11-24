const RELEASE = 'suivi-2';
const CACHE_PREFIX = 'assiette-shell-';
const CACHE = CACHE_PREFIX + RELEASE;
const HOME = new URL('./', self.registration.scope);
const SLASHLESS_HOME = HOME.pathname.replace(/\/$/, '');
const VERSIONED_ASSETS = [
  'style.css', 'app.mjs', 'nutrition.mjs', 'review.mjs', 'backup-sync.mjs', 'weight-trend.mjs',
  'guidance.mjs', 'adaptive-targets.mjs', 'journal.mjs', 'offline.mjs', 'ciqual-search.mjs', 'ciqual-catalog.mjs',
];
const ASSETS = new Set([
  ...VERSIONED_ASSETS.map(path => new URL(path + '?v=' + RELEASE, HOME).href),
  ...['assiette.webmanifest', 'icon-180.png', 'favicon.svg', 'assiette.webp', 'ui.mjs', 'photo-foods.mjs',
    'activity.mjs', 'protein-targets.mjs', 'backup-crypto.mjs', 'backup-github.mjs', 'plate-vision.mjs']
    .map(path => new URL(path, HOME).href),
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(HOME, { cache: 'reload' });
    if (!response.ok || !(await response.clone().text()).includes('app.mjs?v=' + RELEASE)) {
      throw new Error('Assiette release unavailable');
    }
    const cache = await caches.open(CACHE);
    await cache.addAll([...ASSETS].map(url => new Request(url, { cache: 'reload' })));
    await cache.put(HOME, response);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const oldCaches = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE);
    await Promise.all(oldCaches.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isHome = request.mode === 'navigate' && url.origin === HOME.origin &&
    [HOME.pathname, SLASHLESS_HOME, new URL('index.html', HOME).pathname].includes(url.pathname);
  if (!isHome && !ASSETS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(isHome ? HOME : request);
    return cached ?? fetch(request);
  })());
});
