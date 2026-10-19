// Service worker for offline mode (STOIC-2771). Keeps what a site user's phone
// needs to open the app with no signal: the pages they use and the code those
// pages load, plus the menu files. No data from the app's API is cached here:
// that lives in the page's own storage, under the account it belongs to
// (src/lib/offline.js).
//
// Pages: network first, so a phone with signal always gets the current version;
// the copy kept is used only when the network fails or takes too long.
// Code under /_next/static: its file names change with every build, so a kept
// copy is never stale, and it is served from here first.

const PAGES = 'ifc-pages-v1';
const STATIC = 'ifc-static-v1';
const MENUS = 'ifc-menus-v1';
const KEEP = [PAGES, STATIC, MENUS];
const OFFLINE_URL = '/offline.html';
// On a weak signal a page can hang for a long time before failing. Past this,
// the kept copy is shown instead.
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !KEEP.includes(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

// A page is kept by its path alone: /meal-count?site=X&date=Y is the same page
// as /meal-count, and reads its query string once it runs.
const pageKey = (url) => new Request(new URL(url).pathname);

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function navigate(request) {
  const cache = await caches.open(PAGES);
  const key = pageKey(request.url);
  const kept = await cache.match(key);
  try {
    const response = await withTimeout(fetch(request), kept ? NETWORK_TIMEOUT_MS : 30000);
    // Only pages already kept are refreshed: which pages those are is decided
    // by the warm-up, for site users.
    if (response.ok && kept && !response.redirected) await cache.put(key, response.clone());
    return response;
  } catch {
    return kept || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function staticAsset(request) {
  const cache = await caches.open(STATIC);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function menuFile(request) {
  const cache = await caches.open(MENUS);
  try {
    const response = await fetch(request);
    if (response.ok && (await cache.match(request))) await cache.put(request, response.clone());
    return response;
  } catch {
    const kept = await cache.match(request);
    if (kept) return kept;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Next's own requests for a route's data: left to the browser. Without signal
  // they fail, and Next falls back to loading the page, which comes from here.
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  // A menu opens in a tab of its own, which is a navigation too: matched first,
  // by its whole address, since the file is in the query string.
  if (url.pathname === '/api/reports/files/download' && !url.searchParams.has('download')) {
    event.respondWith(menuFile(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staticAsset(request));
  }
});

// Every path under /_next/static a page or stylesheet refers to. The page's
// inline route data names its chunks without the /_next prefix.
const ASSET = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)]+/g;
const assetsIn = (text) => [...new Set((text.match(ASSET) || []).map((path) => (path.startsWith('/_next/') ? path : `/_next/${path}`)))];

async function warmPages(pages) {
  const pageCache = await caches.open(PAGES);
  const staticCache = await caches.open(STATIC);
  const wanted = new Set();
  let complete = true;

  for (const page of pages) {
    const response = await fetch(page, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    if (!response || !response.ok || response.redirected) {
      complete = false;
      continue;
    }
    const html = await response.clone().text();
    await pageCache.put(new Request(page), response);
    for (const asset of assetsIn(html)) wanted.add(asset);
  }

  for (const asset of [...wanted]) {
    let response = await staticCache.match(asset);
    if (!response) {
      response = await fetch(asset).catch(() => null);
      if (!response || !response.ok) {
        complete = false;
        continue;
      }
      await staticCache.put(asset, response.clone());
    }
    // Stylesheets name the fonts they use.
    if (asset.endsWith('.css')) {
      for (const font of assetsIn(await response.clone().text())) {
        wanted.add(font);
        if (!(await staticCache.match(font))) {
          const fontResponse = await fetch(font).catch(() => null);
          if (fontResponse?.ok) await staticCache.put(font, fontResponse);
          else complete = false;
        }
      }
    }
  }

  // Code from builds no page uses any more. Only after every page came back:
  // otherwise the page that failed keeps its old copy and needs its old code.
  if (!complete) return;
  for (const request of await staticCache.keys()) {
    if (!wanted.has(new URL(request.url).pathname)) await staticCache.delete(request);
  }
}

async function warmMenus(files) {
  const cache = await caches.open(MENUS);
  const wanted = new Set(files.map((file) => new URL(file, self.location.origin).href));
  // One file that fails does not stop the others.
  for (const file of wanted) {
    if (await cache.match(file)) continue;
    const response = await fetch(file, { credentials: 'same-origin' }).catch(() => null);
    if (response?.ok) await cache.put(file, response).catch(() => {});
  }
  for (const request of await cache.keys()) {
    if (!wanted.has(request.url)) await cache.delete(request);
  }
}

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type === 'warm') {
    // allSettled: the browser may stop the worker as soon as this settles, so
    // the menus failing must not end it while the pages are still being kept.
    // Half warmed is fine: the next open with signal finishes it.
    event.waitUntil(Promise.allSettled([warmPages(message.pages || []), warmMenus(message.files || [])]));
  } else if (message.type === 'clear-menus') {
    event.waitUntil(caches.delete(MENUS));
  }
});
