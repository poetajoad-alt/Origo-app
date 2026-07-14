"use strict";

/* ==============================
   FIREBASE
================================ */

import { auth } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

/* ==============================
   CONFIGURAÇÕES
================================ */

const LOGIN_PAGE = "login.html";

const AUTH_CHECK_TIMEOUT = 15000;

/* ==============================
   OCULTAR PÁGINA DURANTE A
   VERIFICAÇÃO DA SESSÃO
================================ */

const authGuardStyle = document.createElement("style");

authGuardStyle.textContent = `
  html.auth-checking body {
    visibility: hidden;
    pointer-events: none;
  }

  html.auth-ready body {
    visibility: visible;
  }
`;

document.head.appendChild(authGuardStyle);

document.documentElement.classList.add("auth-checking");

/* ==============================
   PÁGINA ATUAL
================================ */

function getCurrentPageAddress() {
  const fileName =
    window.location.pathname.split("/").pop() || "principal.html";

  return fileName + window.location.search + window.location.hash;
}

/* ==============================
   REDIRECIONAR PARA O LOGIN
================================ */

function redirectToLogin(reason = "unauthenticated") {
  const parameters = new URLSearchParams({
    redirect: getCurrentPageAddress(),
    reason,
  });

  window.location.replace(`${LOGIN_PAGE}?${parameters.toString()}`);
}

/* ==============================
   LIBERAR A PÁGINA
================================ */

function releaseProtectedPage() {
  document.documentElement.classList.remove("auth-checking");

  document.documentElement.classList.add("auth-ready");
}

/* ==============================
   PROMESSA DE AUTENTICAÇÃO
================================ */

/*
  Os próximos arquivos poderão importar
  authReady para obter o usuário somente
  depois que o Firebase confirmar a sessão.

  Exemplo:

  import {
    authReady,
  } from "./auth-guard.js";

  const user = await authReady;
*/

const authReady = new Promise((resolve, reject) => {
  let verificationFinished = false;

  const timeoutId = window.setTimeout(() => {
    if (verificationFinished) {
      return;
    }

    verificationFinished = true;

    console.error(
      "[Auth Guard] O Firebase demorou muito para verificar a sessão.",
    );

    redirectToLogin("timeout");
  }, AUTH_CHECK_TIMEOUT);

  /* ==============================
       OBSERVAR ESTADO DA SESSÃO
    ================================ */

  const unsubscribe = onAuthStateChanged(
    auth,

    (user) => {
      if (verificationFinished) {
        return;
      }

      verificationFinished = true;

      window.clearTimeout(timeoutId);

      unsubscribe();

      if (!user) {
        console.warn("[Auth Guard] Acesso bloqueado: usuário não autenticado.");

        redirectToLogin("unauthenticated");

        return;
      }

      releaseProtectedPage();

      /*
            Evento disponível para outros
            scripts da mesma página.
          */

      window.dispatchEvent(
        new CustomEvent("origo:auth-ready", {
          detail: {
            user,
            uid: user.uid,
          },
        }),
      );

      resolve(user);
    },

    (error) => {
      if (verificationFinished) {
        return;
      }

      verificationFinished = true;

      window.clearTimeout(timeoutId);

      console.error("[Auth Guard] Erro ao verificar a autenticação:", error);

      reject(error);

      redirectToLogin("authentication-error");
    },
  );
});

/* ==============================
   EXPORTAÇÃO
================================ */

export { authReady };
