"use strict";

import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  buildAuthEntryUrl,
  sanitizeAuthDestination,
} from "./auth-routes.mjs";

const PUBLIC_PAGES = new Set([
  "index.html",
  "principal.html",
  "mapa.html",
  "login.html",
  "registre-se.html",
  "offline.html",
]);
const AUTH_CHECK_TIMEOUT = 12000;

function getCurrentPageAddress() {
  const fileName = window.location.pathname.split("/").filter(Boolean).at(-1) || "principal.html";
  return sanitizeAuthDestination(
    `${fileName}${window.location.search}${window.location.hash}`,
    window.location.origin,
  );
}

function redirectToLogin(reason = "unauthenticated") {
  const destination = getCurrentPageAddress();
  const loginUrl = buildAuthEntryUrl("login.html", destination, window.location.origin);
  const separator = loginUrl.includes("?") ? "&" : "?";
  window.location.replace(`${loginUrl}${separator}reason=${encodeURIComponent(reason)}`);
}

const currentPage = window.location.pathname.split("/").filter(Boolean).at(-1) || "principal.html";
const isPublicPage = PUBLIC_PAGES.has(currentPage);

if (!isPublicPage) {
  const authGuardStyle = document.createElement("style");
  authGuardStyle.textContent = `
    html.auth-checking body { visibility: hidden; pointer-events: none; }
    html.auth-ready body { visibility: visible; }
  `;
  document.head.appendChild(authGuardStyle);
  document.documentElement.classList.add("auth-checking");
}

let stateResolved = false;
let unsubscribeAuth = () => {};

const authStateReady = new Promise((resolve) => {
  const finish = (user, error = null) => {
    if (stateResolved) return;
    stateResolved = true;
    window.clearTimeout(timeoutId);
    unsubscribeAuth();

    if (!isPublicPage) {
      document.documentElement.classList.remove("auth-checking");
      document.documentElement.classList.add("auth-ready");
    }

    if (error) {
      window.dispatchEvent(new CustomEvent("origo:auth-state-error", { detail: { error } }));
    }
    window.dispatchEvent(new CustomEvent("origo:auth-ready", {
      detail: { user: user || null, uid: user?.uid || null },
    }));

    if (!isPublicPage && !user) {
      redirectToLogin(error ? "authentication-error" : "unauthenticated");
    }
    resolve(user || null);
  };

  const timeoutId = window.setTimeout(() => {
    finish(null, new Error("A verificação da sessão excedeu o tempo limite."));
  }, AUTH_CHECK_TIMEOUT);

  unsubscribeAuth = onAuthStateChanged(
    auth,
    (user) => finish(user || null),
    (error) => finish(null, error),
  );
});

async function requireAuth(destination = getCurrentPageAddress()) {
  const user = await authStateReady;
  if (user) return user;

  const safeDestination = sanitizeAuthDestination(destination, window.location.origin);
  if (isPublicPage) {
    window.location.replace(
      buildAuthEntryUrl("login.html", safeDestination, window.location.origin),
    );
  }
  const error = new Error("Esta funcionalidade exige uma conta conectada.");
  error.code = "auth/required";
  throw error;
}

// Private pages import requireAuth; authStateReady is safe on public pages.
export { authStateReady, requireAuth };
