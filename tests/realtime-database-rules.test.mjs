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

test("visitors cannot read or write presence; authenticated players can read", async () => {
  await assertDenied("presence.json");
  await assertDenied("presence/guest/session-1.json", { method: "PUT", body: true });
  await assertDenied("presence/guest/session-1.json", { method: "DELETE" });
  await assertAllowed("presence.json", { uid: "player-1" });
});

test("players can write only their own session and only the boolean true", async () => {
  await assertAllowed("presence/writer-1/session-a.json", { uid: "writer-1", method: "PUT", body: true });
  await assertAllowed("presence/writer-1/session-a.json", { uid: "writer-1", method: "DELETE" });
  await assertDenied("presence/player-2/session-a.json", { uid: "writer-1", method: "PUT", body: true });
  await assertDenied("presence/player-2/session-a.json", { uid: "writer-1", method: "DELETE" });
  await assertDenied("presence/writer-1.json", { uid: "writer-1", method: "PUT", body: { sessionA: true } });
  await assertDenied("presence/writer-1/session-b.json", { uid: "writer-1", method: "PUT", body: false });
  await assertDenied("presence/writer-1/session-c.json", { uid: "writer-1", method: "PUT", body: { connected: true, device: "phone" } });
});

test("removing one session preserves another active session for the same account", async () => {
  await assertAllowed("presence/multi-tab/session-a.json", { uid: "multi-tab", method: "PUT", body: true });
  await assertAllowed("presence/multi-tab/session-b.json", { uid: "multi-tab", method: "PUT", body: true });
  await assertAllowed("presence/multi-tab/session-a.json", { uid: "multi-tab", method: "DELETE" });
  const response = await assertAllowed("presence/multi-tab.json", { uid: "observer" });
  assert.deepEqual(await response.json(), { "session-b": true });
});
