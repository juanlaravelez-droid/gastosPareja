const CACHE_NAME = "duobalance-shell-v8";
const CORE_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./styles.css",
  "./app.js",
  "./supabase-config.example.js",
  "./img/logo.jpeg",
  "./img/pareja.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./src/domain/finance.js",
  "./src/application/wallet-validation.js",
  "./src/application/wallet-service.js",
  "./src/application/goal-cover.js",
  "./src/application/expense-service.js",
  "./src/presentation/formatCurrency.js",
  "./src/presentation/render.js",
  "./src/presentation/navigation.js",
  "./src/presentation/ui.js",
  "./src/presentation/components/ThemeToggle.js",
  "./src/presentation/views/DashboardView.js",
  "./src/infrastructure/supabase-repository.js",
  "./src/infrastructure/storage-repository.js",
  "./src/infrastructure/demo-storage.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) =>
            cacheName.startsWith("duobalance-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then((response) => {
          if (!response.ok || response.type !== "basic") return response;

          const responseCopy = response.clone();
          void caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, responseCopy));
          return response;
        });
      })
      .catch(async () => {
        if (request.mode === "navigate") {
          const offlinePage = await caches.match("./index.html");
          if (offlinePage) return offlinePage;
        }
        throw new Error(`No se pudo cargar el recurso offline: ${request.url}`);
      }),
  );
});
