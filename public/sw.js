/**
 * sw.js — Service Worker OBD2 HUD & AI Copilot
 * Strategy:
 *   - Static assets → Cache-First (fast, offline-ready)
 *   - /api/*        → Network-First (live AI, fallback cached)
 *   - Google Fonts / CDN → Stale-While-Revalidate
 */

const CACHE_VERSION  = 'obd2-hud-v2';
const STATIC_CACHE   = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE  = `${CACHE_VERSION}-runtime`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js'
];

const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;600;700&display=swap'
];

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate (cleanup old caches) ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('obd2-hud-') && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. API calls → Network-First with offline fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(event.request));
    return;
  }

  // 2. Google Fonts / CDN → Stale-While-Revalidate
  const isCDN = CDN_ASSETS.some(a => event.request.url.startsWith(a)) ||
                url.hostname.includes('fonts.g') ||
                url.hostname.includes('cdnjs.') ||
                url.hostname.includes('jsdelivr.');
  if (isCDN) {
    event.respondWith(staleWhileRevalidate(event.request, RUNTIME_CACHE));
    return;
  }

  // 3. Same-origin static → Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }
});

// ─── Strategies ───────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

async function networkFirstApi(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Return a graceful JSON error for offline API calls
    return new Response(
      JSON.stringify({ error: 'Sin conexión. El copiloto no está disponible offline.', reply: 'Estás en modo sin conexión. Revisa tu conectividad y vuelve a intentar.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  // Kick off background refresh regardless
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) return cached;
  return (await fetchPromise) || offlineFallback();
}

function offlineFallback() {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin conexión</title>
    <style>body{background:#0F111A;color:#E2E8F0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;}
    h2{color:#00F0FF;font-size:1.2rem;}p{color:#94a3b8;font-size:.9rem;}</style></head>
    <body><h2>⚡ OBD2 HUD — Sin conexión</h2><p>La aplicación se restaurará cuando recuperes internet.</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  );
}
