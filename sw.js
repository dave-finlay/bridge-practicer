// Service worker: keeps a copy of the app's files on the phone, so the app
// opens instantly and works with no signal at the club. The same as the
// bid recorder's.
//
// Strategy, "stale while revalidate": always answer from the copy, and
// meanwhile fetch the file again to refresh the copy. So a new version of
// the app (or new problems) shows up the second time it is opened after
// being published.
//
// When adding a file to the app, add it to FILES and bump the version in
// CACHE, so the new list is fetched in full. `npm run check` fails if a
// lesson file or a script is missing from FILES.

const CACHE = 'practicer-v2';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/auction.js',
  'js/hands.js',
  'js/problems.js',
  'js/store.js',
  'problems/dd.json',
  'problems/stayman.json',
  'problems/texas.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// First visit: download everything, so the app works offline from then on.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

// A new version took over: delete the copies made by older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // ignoreSearch: '?anything' on the URL still finds the copy.
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const refresh = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached); // offline: the copy is all there is
      if (!cached) return refresh;
      event.waitUntil(refresh);
      return cached;
    }),
  );
});
