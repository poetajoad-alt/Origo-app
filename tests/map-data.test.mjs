import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCoordinates, normalizeMapPoint, loadMapCollections } from "../map-data.mjs";

const doc = (id, data) => ({ id, data: () => data });
const now = new Date("2026-10-14T12:00:00Z");

test("normalizes valid player, store, and event markers from source records", () => {
  const player = normalizeMapPoint("player", doc("p1", { tipo: "player", ativo: true, nome: "A", latitude: -23, longitude: -46 }), now);
  const store = normalizeMapPoint("store", doc("s1", { ativo: true, nome: "Loja", latitude: 0, longitude: 180 }), now);
  const event = normalizeMapPoint("event", doc("e1", { ativo: true, titulo: "Torneio", latitude: 90, longitude: -180, dataHoraFim: new Date("2026-10-15T00:00:00Z") }), now);
  assert.deepEqual([player.type, store.type, event.type], ["player", "store", "event"]);
  assert.deepEqual([player.id, store.id, event.id], ["p1", "s1", "e1"]);
});

test("rejects null, missing, malformed and out-of-range coordinates", () => {
  for (const data of [
    { latitude: null, longitude: 1 }, { latitude: 1 }, { latitude: "", longitude: 1 },
    { latitude: "nope", longitude: 1 }, { latitude: 90.01, longitude: 0 },
    { latitude: 0, longitude: -180.01 }, { latitude: true, longitude: 0 },
  ]) assert.equal(normalizeCoordinates(data), null);
  assert.equal(normalizeMapPoint("store", doc("bad", { ativo: true, nome: "Bad", latitude: null, longitude: 0 }), now), null);
});

test("only opted-in active public player profiles are shown", () => {
  const base = { tipo: "player", ativo: true, nome: "Jogador", latitude: 1, longitude: 2 };
  assert.ok(normalizeMapPoint("player", doc("ok", base), now));
  assert.equal(normalizeMapPoint("player", doc("private", { ...base, ativo: false }), now), null);
  assert.equal(normalizeMapPoint("player", doc("wrong-type", { ...base, tipo: "store" }), now), null);
  const point = normalizeMapPoint("player", doc("safe", { ...base, telefone: "123", email: "private@example.test" }), now);
  assert.equal("telefone" in point, false);
  assert.equal("email" in point, false);
});

test("rejects ended events and inactive stores", () => {
  assert.equal(normalizeMapPoint("event", doc("past", { ativo: true, titulo: "Past", latitude: 1, longitude: 2, dataHoraFim: new Date("2026-10-13T00:00:00Z") }), now), null);
  assert.equal(normalizeMapPoint("store", doc("off", { ativo: false, nome: "Off", latitude: 1, longitude: 2 }), now), null);
});

test("empty collections are distinct from failed reads", async () => {
  const result = await loadMapCollections({
    perfisPublicos: async () => [],
    lojas: async () => [],
    eventos: async () => { throw new Error("permission-denied"); },
  }, now);
  assert.equal(result.collections.perfisPublicos.status, "empty");
  assert.equal(result.collections.lojas.status, "empty");
  assert.equal(result.collections.eventos.status, "error");
  assert.equal(result.hasErrors, true);
  assert.equal(result.allFailed, false);
  assert.equal(result.hasPoints, false);
});

test("preview contains only queried source points, never demo markers", async () => {
  const records = {
    perfisPublicos: [doc("real-player", { tipo: "player", ativo: true, nome: "Real", latitude: 1, longitude: 2 })],
    lojas: [], eventos: [],
  };
  const result = await loadMapCollections(Object.fromEntries(Object.entries(records).map(([key, value]) => [key, async () => value])), now);
  assert.deepEqual(result.points.map((point) => point.id), ["real-player"]);
  const source = await readFile(new URL("../principal.js", import.meta.url), "utf8");
  assert.equal(source.includes("communityMapPoints"), false);
  assert.equal(source.includes("Jogador disponível"), false);
});

test("map navigation links remain available in the main page", async () => {
  const html = await readFile(new URL("../principal.html", import.meta.url), "utf8");
  assert.match(html, /href="mapa\.html"/);
  assert.match(html, /href="conexoes\.html"/);
  assert.match(html, /href="meu-perfil\.html"/);
  assert.match(html, /id="community-map-preview"/);
});


test("online match keeps its own stylesheet and one module script", async () => {
  const html = await readFile(new URL("../partida-online.html", import.meta.url), "utf8");
  assert.match(html, /href="partida-online\.css\?v=1"/);
  assert.equal((html.match(/partida-online\.js\?v=1/g) || []).length, 1);
  assert.equal(html.includes("base.css"), false);
});
