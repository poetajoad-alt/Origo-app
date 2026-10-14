import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildAuthEntryUrl,
  getAuthDestination,
  sanitizeAuthDestination,
} from "../auth-routes.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("auth destinations allow known local pages and reject external or unknown targets", () => {
  const origin = "https://origo.example";
  assert.equal(sanitizeAuthDestination("meu-perfil.html", origin), "meu-perfil.html");
  assert.equal(sanitizeAuthDestination("principal.html#matches-title", origin), "principal.html#matches-title");
  assert.equal(sanitizeAuthDestination("https://attacker.example", origin), "principal.html");
  assert.equal(sanitizeAuthDestination("//attacker.example/path", origin), "principal.html");
  assert.equal(sanitizeAuthDestination("https://origo.example/unknown.html", origin), "principal.html");
});

test("login and registration retain the requested destination", () => {
  assert.equal(
    getAuthDestination("?redirect=meu-perfil.html", "https://origo.example"),
    "meu-perfil.html",
  );
  assert.equal(
    buildAuthEntryUrl("registre-se.html", "principal.html#matches-title", "https://origo.example"),
    "registre-se.html?redirect=principal.html%23matches-title",
  );
  assert.equal(
    getAuthDestination("?redirect=https%3A%2F%2Fattacker.example", "https://origo.example"),
    "principal.html",
  );
});

test("auth guard separates nullable session state from required access and protects private routes", async () => {
  const source = await read("auth-guard.js");
  assert.match(source, /authStateReady/);
  assert.match(source, /function requireAuth/);
  assert.match(source, /const PUBLIC_PAGES = new Set/);
  const publicPages = source.match(/const PUBLIC_PAGES = new Set\(\[([\s\S]*?)\]\)/)?.[1] || "";
  assert.doesNotMatch(publicPages, /admin-eventos|meu-perfil|conexoes|partida-online/);

  for (const path of ["meu-perfil.js", "conexoes.js", "partida-online.js", "admin-eventos.js"]) {
    assert.match(await read(path), /requireAuth\(\)/, path);
  }
});

test("visitor UI hides user-only navigation and replaces private match data with login actions", async () => {
  const html = await read("principal.html");
  const app = await read("principal.js");
  const auth = await read("principal-auth.js");
  assert.match(html, /id="side-menu-auth-links"/);
  assert.match(html, /id="home-guest-actions"/);
  assert.match(html, /id="mobile-login-link"/);
  assert.match(html, /data-auth-only hidden/);
  assert.match(app, /const currentUser = await authStateReady/);
  assert.match(app, /Entre na sua conta para acompanhar convites e partidas/);
  assert.match(auth, /if \(!user\) return;/);
  assert.match(auth, /window\.location\.replace\("principal\.html"\)/);
});

test("public map path omits player queries for visitors", async () => {
  const map = await read("mapa.js");
  const home = await read("principal.js");
  assert.match(map, /const authenticatedUser = await authStateReady/);
  assert.match(map, /if \(authenticatedUser\) \{/);
  assert.match(map, /includePlayers: true/);
  assert.match(map, /includePlayers: false/);
  assert.match(map, /waitForAuth: \(\) => authStateReady/);
  assert.match(home, /includePlayers,[\s\S]*?waitForAuth/);
  assert.match(map, /const guestActions = document\.getElementById\("map-guest-actions"\)/);
});

test("e-mail and Google authentication remain available and share the guarded return destination", async () => {
  const login = await read("login.js");
  const register = await read("registre-se.js");
  assert.match(login, /signInWithEmailAndPassword/);
  assert.match(login, /signInWithPopup/);
  assert.match(login, /getAuthDestination/);
  assert.match(register, /createUserWithEmailAndPassword/);
  assert.match(register, /signInWithPopup/);
  assert.match(register, /window\.location\.replace\(requestedDestination\)/);
});

test("PWA launch and root entry route visitors to the public principal page", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  const index = await read("index.html");
  const worker = await read("service-worker.js");
  assert.equal(manifest.start_url, "./principal.html");
  assert.match(index, /location\.replace\(new URL\("\.\/principal\.html"/);
  assert.match(worker, /origo-pwa-v5/);
  assert.match(worker, /\.\/principal\.html/);
});
