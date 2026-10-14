import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPresenceToPoints,
  createPresenceController,
  createPublicPresenceSubscriber,
  describePlayerStatus,
  getPresenceState,
  onlineUserIdsFromSnapshot,
} from "../presence-core.mjs";

function createFakeRealtimeDatabase() {
  const values = new Map();
  const disconnectOps = new Map();
  const connectionListeners = new Map();
  const operationOrder = [];
  let sessionId = 0;
  let listenerId = 0;
  let activeConnectionId = null;

  const deps = {
    database: {},
    ref: (_database, path) => ({ path, key: path.split("/").at(-1) }),
    push: (parent) => {
      const key = `session-${++sessionId}`;
      return { path: `${parent.path}/${key}`, key };
    },
    onValue: (reference, callback) => {
      const id = ++listenerId;
      connectionListeners.set(id, { reference, callback });
      if (reference.path === ".info/connected") callback({ val: () => false });
      return () => connectionListeners.delete(id);
    },
    onDisconnect: (reference) => ({
      remove: async () => {
        operationOrder.push(`onDisconnect:${reference.path}`);
        disconnectOps.set(reference.path, activeConnectionId);
      },
      cancel: async () => disconnectOps.delete(reference.path),
    }),
    set: async (reference, value) => {
      operationOrder.push(`set:${reference.path}`);
      values.set(reference.path, value);
    },
    remove: async (reference) => values.delete(reference.path),
  };

  return {
    deps,
    values,
    disconnectOps,
    operationOrder,
    connected(connectionId, value) {
      const listener = connectionListeners.get(connectionId);
      activeConnectionId = connectionId;
      listener?.callback({ val: () => value });
      activeConnectionId = null;
    },
    disconnectConnection(connectionId) {
      for (const [path, owner] of disconnectOps.entries()) {
        if (owner !== connectionId) continue;
        values.delete(path);
        disconnectOps.delete(path);
      }
      this.connected(connectionId, false);
    },
  };
}

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

function createController(fake) {
  return createPresenceController({ ...fake.deps });
}

test("unknown presence is never treated as online and availability remains independent", () => {
  assert.equal(getPresenceState(new Set(), "player-1", false), "unknown");
  assert.equal(getPresenceState(new Set(), "player-1", true), "offline");
  assert.equal(describePlayerStatus({ presenceState: "unknown", available: true }), "Status desconhecido · Disponível para jogar");
  assert.equal(describePlayerStatus({ presenceState: "offline", available: true }), "Offline · Disponível para jogar");
  assert.equal(describePlayerStatus({ presenceState: "online", available: false }), "Online · Não disponível para jogar");
});

test("online states come only from public sessions with an active true value", () => {
  const online = onlineUserIdsFromSnapshot({
    "player-1": { tabA: true, tabB: true },
    "player-2": { stale: false },
    "player-3": null,
  });
  assert.deepEqual([...online], ["player-1"]);
});

test("two opted-in players get separate private and map sessions", async () => {
  const fake = createFakeRealtimeDatabase();
  const playerOne = createController(fake);
  const playerTwo = createController(fake);
  assert.equal(playerOne.start("player-1"), true);
  assert.equal(playerTwo.start("player-2"), true);
  playerOne.setMapVisible(true);
  playerTwo.setMapVisible(true);
  fake.connected(1, true);
  fake.connected(2, true);
  await flush();

  assert.deepEqual([...fake.values.keys()].sort(), [
    "mapPresence/player-1/session-1",
    "mapPresence/player-2/session-2",
    "presence/player-1/session-1",
    "presence/player-2/session-2",
  ]);
  for (const path of fake.values.keys()) {
    assert.ok(fake.operationOrder.indexOf(`onDisconnect:${path}`) < fake.operationOrder.indexOf(`set:${path}`));
  }
});

test("opted-out players retain a private session but publish no map presence", async () => {
  const fake = createFakeRealtimeDatabase();
  const controller = createController(fake);
  controller.start("hidden-player");
  controller.setMapVisible(false);
  fake.connected(1, true);
  await flush();

  assert.equal(fake.values.get("presence/hidden-player/session-1"), true);
  assert.equal(fake.values.has("mapPresence/hidden-player/session-1"), false);
});

test("removing map opt-in removes only the map session and preserves the private connection", async () => {
  const fake = createFakeRealtimeDatabase();
  const controller = createController(fake);
  controller.start("player-1");
  controller.setMapVisible(true);
  fake.connected(1, true);
  await flush();

  controller.setMapVisible(false);
  await flush();
  assert.equal(fake.values.has("mapPresence/player-1/session-1"), false);
  assert.equal(fake.values.get("presence/player-1/session-1"), true);
});

test("availability preference does not change connection state or map participation", async () => {
  const fake = createFakeRealtimeDatabase();
  const controller = createController(fake);
  controller.start("player-1");
  controller.setMapVisible(true);
  fake.connected(1, true);
  await flush();

  const points = applyPresenceToPoints([
    { id: "player-1", type: "player", available: false },
    { id: "shop-1", type: "store", available: false },
  ], { "player-1": { "session-1": true } }, new Set(["player-1"]));
  assert.equal(points[0].online, true);
  assert.equal(points[0].available, false);
  assert.equal(points[1].presenceState, undefined);
  assert.equal(fake.values.has("mapPresence/player-1/session-1"), true);
});

test("one tab disconnecting or logging out leaves another same-user session online", async () => {
  const fake = createFakeRealtimeDatabase();
  const tabOne = createController(fake);
  const tabTwo = createController(fake);
  tabOne.start("player-1");
  tabTwo.start("player-1");
  tabOne.setMapVisible(true);
  tabTwo.setMapVisible(true);
  fake.connected(1, true);
  fake.connected(2, true);
  await flush();

  fake.disconnectConnection(1);
  assert.equal(fake.values.has("presence/player-1/session-1"), false);
  assert.equal(fake.values.has("mapPresence/player-1/session-1"), false);
  assert.equal(fake.values.get("presence/player-1/session-2"), true);
  assert.equal(fake.values.get("mapPresence/player-1/session-2"), true);

  await tabTwo.stop();
  assert.equal(fake.values.has("presence/player-1/session-2"), false);
  assert.equal(fake.values.has("mapPresence/player-1/session-2"), false);
});

test("loss and recovery of connection re-registers both visible session paths", async () => {
  const fake = createFakeRealtimeDatabase();
  const controller = createController(fake);
  controller.start("player-1");
  controller.setMapVisible(true);
  fake.connected(1, true);
  await flush();
  fake.disconnectConnection(1);
  fake.connected(1, true);
  await flush();

  assert.equal(fake.values.get("presence/player-1/session-1"), true);
  assert.equal(fake.values.get("mapPresence/player-1/session-1"), true);
  assert.equal(fake.disconnectOps.has("presence/player-1/session-1"), true);
  assert.equal(fake.disconnectOps.has("mapPresence/player-1/session-1"), true);
});

test("map subscriber listens only to the supplied visible profile IDs, never either root", () => {
  const listeners = new Map();
  const paths = [];
  const subscribe = createPublicPresenceSubscriber({
    database: {},
    ref: (_database, path) => ({ path }),
    onValue: (reference, callback) => {
      paths.push(reference.path);
      listeners.set(reference.path, callback);
      return () => listeners.delete(reference.path);
    },
  });

  subscribe(["visible-1", "visible-1"], () => {}, () => {});
  assert.deepEqual(paths.sort(), [".info/connected", "mapPresence/visible-1"].sort());
  assert.equal(paths.includes("presence"), false);
  assert.equal(paths.includes("mapPresence"), false);
});

test("hidden profile IDs are never subscribed or applied to map points", () => {
  const listeners = new Map();
  const subscribe = createPublicPresenceSubscriber({
    database: {},
    ref: (_database, path) => ({ path }),
    onValue: (reference, callback) => {
      listeners.set(reference.path, callback);
      return () => listeners.delete(reference.path);
    },
  });
  let latest = {};
  let known = new Set();
  subscribe(["visible"], (snapshot, knownIds) => {
    latest = snapshot;
    known = knownIds;
  });
  listeners.get("mapPresence/visible")({ val: () => ({ tab: true }) });
  listeners.get(".info/connected")({ val: () => true });

  const points = applyPresenceToPoints(
    [{ id: "visible", type: "player" }],
    { ...latest, hidden: { secretTab: true } },
    known,
  );
  assert.equal(points[0].presenceState, "online");
  assert.equal(listeners.has("mapPresence/hidden"), false);
  assert.equal(known.has("hidden"), false);
});

test("a profile hidden from Firestore never gets a public status from the map", () => {
  const points = applyPresenceToPoints([], { "hidden-player": { tab: true } }, new Set());
  assert.deepEqual(points, []);
});

test("presence controller safely does nothing until the database URL is configured", () => {
  const fake = createFakeRealtimeDatabase();
  const controller = createPresenceController({ ...fake.deps, database: null });
  assert.equal(controller.start("player-1"), false);
  assert.equal(controller.setMapVisible(true), false);
  assert.equal(fake.values.size, 0);
});
