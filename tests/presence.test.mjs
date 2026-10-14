import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPresenceToPoints,
  createPresenceController,
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
  let connectionId = 0;

  const deps = {
    database: {},
    ref: (_database, path) => ({ path }),
    push: (parent) => ({ path: `${parent.path}/session-${++sessionId}` }),
    onValue: (reference, callback) => {
      const id = ++connectionId;
      connectionListeners.set(id, callback);
      callback({ val: () => false });
      return () => connectionListeners.delete(id);
    },
    onDisconnect: (reference) => ({
      remove: async () => {
        operationOrder.push(`onDisconnect:${reference.path}`);
        disconnectOps.set(reference.path, true);
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
    connected(connection, value) {
      connectionListeners.get(connection)?.({ val: () => value });
    },
    disconnectSession(path) {
      assert.equal(disconnectOps.has(path), true, "onDisconnect must be armed before a session is written");
      values.delete(path);
      disconnectOps.delete(path);
      const connection = [...connectionListeners.entries()].find(([, callback]) => callback)?.[0];
      if (connection) this.connected(connection, false);
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

test("presence snapshot reports online only for users with an active true session", () => {
  const online = onlineUserIdsFromSnapshot({
    "player-1": { tabA: true, tabB: true },
    "player-2": { stale: false },
    "player-3": null,
  });
  assert.deepEqual([...online], ["player-1"]);
});

test("two players create separate authenticated sessions and register onDisconnect before online writes", async () => {
  const fake = createFakeRealtimeDatabase();
  const playerOne = createController(fake);
  const playerTwo = createController(fake);
  assert.equal(playerOne.start("player-1"), true);
  assert.equal(playerTwo.start("player-2"), true);
  fake.connected(1, true);
  fake.connected(2, true);
  await flush();

  assert.deepEqual([...fake.values.keys()].sort(), [
    "presence/player-1/session-1",
    "presence/player-2/session-2",
  ]);
  assert.ok(fake.operationOrder.indexOf("onDisconnect:presence/player-1/session-1") < fake.operationOrder.indexOf("set:presence/player-1/session-1"));
  assert.ok(fake.operationOrder.indexOf("onDisconnect:presence/player-2/session-2") < fake.operationOrder.indexOf("set:presence/player-2/session-2"));
  assert.deepEqual([...onlineUserIdsFromSnapshot({
    "player-1": { "session-1": true },
    "player-2": { "session-2": true },
  })].sort(), ["player-1", "player-2"]);
});

test("availability preference does not change the real connection state", async () => {
  const fake = createFakeRealtimeDatabase();
  const controller = createController(fake);
  controller.start("player-1");
  fake.connected(1, true);
  await flush();

  const points = applyPresenceToPoints([
    { id: "player-1", type: "player", available: false },
    { id: "shop-1", type: "store", available: false },
  ], { "player-1": { "session-1": true } }, true);
  assert.equal(points[0].online, true);
  assert.equal(points[0].available, false);
  assert.equal(points[1].presenceState, undefined);
});

test("one tab disconnecting or logging out leaves another same-user session online", async () => {
  const fake = createFakeRealtimeDatabase();
  const tabOne = createController(fake);
  const tabTwo = createController(fake);
  tabOne.start("player-1");
  tabTwo.start("player-1");
  fake.connected(1, true);
  fake.connected(2, true);
  await flush();

  fake.disconnectSession("presence/player-1/session-1");
  assert.equal(fake.values.has("presence/player-1/session-1"), false);
  assert.equal(fake.values.get("presence/player-1/session-2"), true);
  assert.deepEqual([...onlineUserIdsFromSnapshot({ "player-1": { "session-2": true } })], ["player-1"]);

  await tabTwo.stop();
  assert.equal(fake.values.has("presence/player-1/session-2"), false);
});

test("loss and recovery of the database connection recreate only the current session", async () => {
  const fake = createFakeRealtimeDatabase();
  const controller = createController(fake);
  controller.start("player-1");
  fake.connected(1, true);
  await flush();
  fake.disconnectSession("presence/player-1/session-1");
  fake.connected(1, true);
  await flush();

  assert.equal(fake.values.get("presence/player-1/session-1"), true);
  assert.equal(fake.disconnectOps.has("presence/player-1/session-1"), true);
});

test("a profile hidden from the map receives no displayed presence state", () => {
  const visiblePlayers = [{ id: "visible", type: "player", available: true }];
  const updated = applyPresenceToPoints(visiblePlayers, {
    visible: { a: true },
    hidden: { b: true },
  });
  assert.deepEqual(updated.map((point) => point.id), ["visible"]);
  assert.equal(updated[0].online, true);
});

test("presence controller safely does nothing until the database URL is configured", () => {
  const fake = createFakeRealtimeDatabase();
  const controller = createPresenceController({ ...fake.deps, database: null });
  assert.equal(controller.start("player-1"), false);
  assert.equal(fake.values.size, 0);
});
