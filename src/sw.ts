/// <reference lib="webworker" />
// Service worker: precaches every built file (with content hashes, so a new
// release replaces exactly what changed) and serves the app offline.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';
import { WILD_FORMAT } from './wild-format';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
// Wild plant records by state (public/wild/<format>/NN.json, src/wild.ts): too many to keep every state's,
// so each is kept once fetched (the garden's own state, and any over a county line), then works offline.
// Refreshed in the background when online. A new format has a new folder and cache (an app always reads the
// format it was made for); older formats' caches are cleared when a new version takes over. (Not
// "landscape-planner-…": that's the old worker's, cleared below.)
const WILD_CACHE = `fullgrown-wild-${WILD_FORMAT}`;
registerRoute(({ url }) => url.origin === self.location.origin && new RegExp(`/wild/${WILD_FORMAT}/\\d\\d\\.json$`).test(url.pathname), new StaleWhileRevalidate({ cacheName: WILD_CACHE }));

// Normally a new version waits for the user to tap "Update". But the
// previous hand-written worker has no update prompt, so when replacing it we
// take over right away (the page keeps running; the next open is the new app).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      if (keys.some((k) => k.startsWith('landscape-planner-'))) return self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  // Remove caches made by the hand-written service worker of earlier versions
  // ("landscape-planner-v1" … "-v8"), which served everything cache-first.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('landscape-planner-') || (k.startsWith('fullgrown-wild') && k !== WILD_CACHE)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// The page asks us to take over once the user accepts an update.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});
