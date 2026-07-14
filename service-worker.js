"use strict";

/* ==============================
   VERSÃO DO CACHE
================================ */

const CACHE_NAME = "origo-pwa-v2";

const OFFLINE_PAGE = "./offline.html";

/* ==============================
   ARQUIVOS ESSENCIAIS
================================ */

const CORE_ASSETS = [
  "./index.html",
  "./index.css",
  "./offline.html",

  "./assets/logo-origo-index.png",

  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
];

/* ==============================
   INSTALAÇÃO
================================ */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    }),
  );
});

/* ==============================
   LIMPEZA DE CACHES ANTIGOS
================================ */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const outdatedCaches = cacheNames.filter((cacheName) => {
        return cacheName !== CACHE_NAME;
      });

      return Promise.all(
        outdatedCaches.map((cacheName) => {
          return caches.delete(cacheName);
        }),
      );
    }),
  );
});

/* ==============================
   REQUISIÇÃO COM REDE PRIMEIRO
================================ */

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);

      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === "navigate") {
      return caches.match(OFFLINE_PAGE);
    }

    throw error;
  }
}

/* ==============================
   INTERCEPTAR ARQUIVOS LOCAIS
================================ */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestURL = new URL(request.url);

  /*
   * Apenas arquivos do próprio Origo.
   *
   * Firebase, Google Fonts, OpenStreetMap,
   * Leaflet e outras origens continuam sendo
   * acessados diretamente pela internet.
   */
  if (requestURL.origin !== self.location.origin) {
    return;
  }

  event.respondWith(networkFirst(request));
});
