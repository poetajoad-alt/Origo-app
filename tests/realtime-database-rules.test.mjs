import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projectId = "demo-origo-presence-test";
const databaseNamespace = `${projectId}-default-rtdb`;
const databaseBaseUrl = "http://127.0.0.1:9000";
const rules = await readFile(new URL("../database.rules.json", import.meta.url), "utf8");

function databaseUrl(path = ".json", uid) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, databaseBaseUrl);
  url.searchParams.set("ns", databaseNamespace);
  if (uid) {
    url.searchParams.set("access_token", "");
    url.searchParams.set("auth_variable_override", JSON.stringify({ uid }));
  }
  return url;
}

async function request(path, { uid, method = "GET", body } = {}) {
  return fetch(databaseUrl(path, uid), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function assertAllowed(path, options = {}) {
  const response = await request(path, options);
  if (!response.ok) {
    assert.fail(`${options.method || "GET"} ${path} should be allowed, got ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function assertDenied(path, options = {}) {
  const response = await request(path, options);
  assert.notEqual(response.status, 200, `${options.method || "GET"} ${path} should be denied`);
}

test("loads the RTDB rules into the local emulator", async () => {
  const response = await fetch(databaseUrl(".settings/rules.json"), {
    method: "PUT",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: rules,
  });
  assert.ok(response.ok, `rules load failed: ${response.status} ${await response.text()}`);
});

test("anonymous visitors cannot read or write private or map presence", async () => {
  await assertDenied("presence.json");
  await assertDenied("mapPresence.json");
  await assertDenied("presence/guest/session-1.json");
  await assertDenied("mapPresence/guest/session-1.json");
  await assertDenied("presence/guest/session-1.json", { method: "PUT", body: true });
  await assertDenied("mapPresence/guest/session-1.json", { method: "PUT", body: true });
});

test("private session reads are scoped to the owning account; root enumeration is denied", async () => {
  await assertAllowed("presence/player-1/session-a.json", { uid: "player-1", method: "PUT", body: true });
  await assertAllowed("presence/player-1.json", { uid: "player-1" });
  await assertDenied("presence/player-1.json", { uid: "player-2" });
  await assertDenied("presence.json", { uid: "player-2" });
});

test("only exact map-presence user paths are readable by authenticated map clients", async () => {
  await assertAllowed("mapPresence/visible-player/session-a.json", { uid: "visible-player", method: "PUT", body: true });
  const visible = await assertAllowed("mapPresence/visible-player.json", { uid: "map-viewer" });
  assert.deepEqual(await visible.json(), { "session-a": true });
  await assertDenied("mapPresence.json", { uid: "map-viewer" });
});

test("a hidden player's private sessions are inaccessible and absent from the map index", async () => {
  await assertAllowed("presence/hidden-player/session-a.json", { uid: "hidden-player", method: "PUT", body: true });

  await assertDenied("presence/hidden-player.json", { uid: "map-viewer" });
  const mapIndex = await assertAllowed("mapPresence/hidden-player.json", { uid: "map-viewer" });
  assert.equal(await mapIndex.json(), null);
});

test("players can only write their own boolean session paths", async () => {
  await assertAllowed("presence/writer-1/session-a.json", { uid: "writer-1", method: "PUT", body: true });
  await assertAllowed("mapPresence/writer-1/session-a.json", { uid: "writer-1", method: "PUT", body: true });
  await assertAllowed("presence/writer-1/session-a.json", { uid: "writer-1", method: "DELETE" });
  await assertAllowed("mapPresence/writer-1/session-a.json", { uid: "writer-1", method: "DELETE" });

  await assertDenied("presence/player-2/session-a.json", { uid: "writer-1", method: "PUT", body: true });
  await assertDenied("mapPresence/player-2/session-a.json", { uid: "writer-1", method: "PUT", body: true });
  await assertDenied("presence/player-2/session-a.json", { uid: "writer-1", method: "DELETE" });
  await assertDenied("mapPresence/player-2/session-a.json", { uid: "writer-1", method: "DELETE" });
  await assertDenied("presence/writer-1.json", { uid: "writer-1", method: "PUT", body: { sessionA: true } });
  await assertDenied("mapPresence/writer-1.json", { uid: "writer-1", method: "PUT", body: { sessionA: true } });
  await assertDenied("presence/writer-1/session-b.json", { uid: "writer-1", method: "PUT", body: false });
  await assertDenied("mapPresence/writer-1/session-b.json", { uid: "writer-1", method: "PUT", body: { connected: true } });
});

test("removing one session leaves another active session in both indexes", async () => {
  await assertAllowed("presence/multi-tab/session-a.json", { uid: "multi-tab", method: "PUT", body: true });
  await assertAllowed("presence/multi-tab/session-b.json", { uid: "multi-tab", method: "PUT", body: true });
  await assertAllowed("mapPresence/multi-tab/session-a.json", { uid: "multi-tab", method: "PUT", body: true });
  await assertAllowed("mapPresence/multi-tab/session-b.json", { uid: "multi-tab", method: "PUT", body: true });
  await assertAllowed("presence/multi-tab/session-a.json", { uid: "multi-tab", method: "DELETE" });
  await assertAllowed("mapPresence/multi-tab/session-a.json", { uid: "multi-tab", method: "DELETE" });

  const privateSessions = await assertAllowed("presence/multi-tab.json", { uid: "multi-tab" });
  const mapSessions = await assertAllowed("mapPresence/multi-tab.json", { uid: "map-viewer" });
  assert.deepEqual(await privateSessions.json(), { "session-b": true });
  assert.deepEqual(await mapSessions.json(), { "session-b": true });
});

test("an opted-out client can still publish its own map index (cross-service consent limit)", async () => {
  // RTDB Rules cannot check the Firestore profile's map opt-in. The client must
  // follow that preference; a modified authenticated client can publish itself.
  await assertAllowed("mapPresence/hidden-but-malicious/session-a.json", {
    uid: "hidden-but-malicious",
    method: "PUT",
    body: true,
  });
  const selfPublished = await assertAllowed("mapPresence/hidden-but-malicious.json", { uid: "map-viewer" });
  assert.deepEqual(await selfPublished.json(), { "session-a": true });
});
