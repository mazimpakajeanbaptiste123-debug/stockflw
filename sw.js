// ============================================================
// StockFlow Service Worker — Auto-Update Edition
// ============================================================
// HOW TO TRIGGER AN UPDATE ON YOUR USERS:
//   1. Make your changes to index.html
//   2. Change CACHE_VERSION below to any new value (e.g. 'v2', 'v3', etc.)
//   3. Deploy to Netlify
//   4. The app will detect the change and show an "Update Available" banner
//      to all users. They tap "Update Now" and get the latest version instantly.
// ============================================================

const CACHE_VERSION = 'sf-v1';  // ← CHANGE THIS every time you deploy an update
const CACHE_NAME = `stockflow-${CACHE_VERSION}`;

// Files to cache for offline use
const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
];

// ── INSTALL — cache core files ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache files individually so one failure doesn't break everything
      return Promise.allSettled(
        CORE_FILES.map(url => cache.add(url).catch(e => console.warn('Cache miss:', url, e)))
      );
    })
  );
  // Do NOT skipWaiting here — we wait for user to confirm the update
});

// ── ACTIVATE — clean up old caches ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('stockflow-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — network first for HTML, cache first for assets ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for Firebase and external APIs
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('wa.me') ||
    event.request.method !== 'GET'
  ) {
    return; // Let browser handle it normally
  }

  // For the main HTML file — network first, cache fallback
  // This ensures users always get the latest version when online
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.pathname === scopePath || url.pathname === scopePath.replace(/\/$/, '') || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Got a fresh response — update the cache
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline — serve from cache
          return caches.match(event.request) || caches.match(self.registration.scope + 'index.html');
        })
    );
    return;
  }

  // For other files (icons, manifest) — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// ── MESSAGES — handle commands from the app ───────────────────
self.addEventListener('message', event => {
  // App asks us to skip waiting and take control immediately
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // App asks for our version (shown in Settings)
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }
});
