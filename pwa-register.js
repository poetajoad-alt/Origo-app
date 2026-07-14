"use strict";

/* ==============================
   REGISTRO DO SERVICE WORKER
================================ */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        "./service-worker.js",
        {
          scope: "./",
        },
      );

      /*
       * Solicita ao navegador uma verificação
       * por versões mais recentes.
       */
      registration.update();

      console.log("[PWA] Service Worker registrado com sucesso.");
    } catch (error) {
      console.error(
        "[PWA] Não foi possível registrar o Service Worker:",
        error,
      );
    }
  });
}
