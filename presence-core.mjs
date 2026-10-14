export function onlineUserIdsFromSnapshot(snapshot) {
  const onlineUsers = new Set();
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return onlineUsers;

  for (const [uid, sessions] of Object.entries(snapshot)) {
    if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) continue;
    if (Object.values(sessions).some((session) => session === true)) onlineUsers.add(uid);
  }
  return onlineUsers;
}

export function getPresenceState(onlineUserIds, uid, known = true) {
  if (!known) return "unknown";
  return onlineUserIds?.has(uid) ? "online" : "offline";
}

export function describePlayerStatus(point) {
  const connection = point.presenceState || "unknown";
  const connectionLabel = connection === "online" ? "Online" : connection === "offline" ? "Offline" : "Status desconhecido";
  const playLabel = point.available ? "Disponível para jogar" : "Não disponível para jogar";
  return `${connectionLabel} · ${playLabel}`;
}

export function applyPresenceToPoints(points, snapshot, known = true) {
  const onlineUserIds = onlineUserIdsFromSnapshot(snapshot);
  return points.map((point) => {
    if (point.type !== "player") return point;
    const presenceState = getPresenceState(onlineUserIds, point.id, known);
    return {
      ...point,
      presenceState,
      online: presenceState === "online",
    };
  });
}

export function createPresenceController({
  database,
  ref,
  push,
  onValue,
  onDisconnect,
  set,
  remove,
  onError = () => {},
}) {
  let activeSession = null;
  let generation = 0;

  async function cleanupSession(session) {
    if (!session.connected) return;

    try {
      await remove(session.sessionRef);
    } catch {
      // The server-side onDisconnect remains the fallback if the client went offline.
      return;
    }
    try {
      await onDisconnect(session.sessionRef).cancel();
    } catch {
      // A stale server cleanup for this unique session key is harmless.
    }
  }

  function start(uid) {
    if (!database || !uid) return false;
    if (activeSession?.uid === uid) return true;

    const previous = activeSession;
    if (previous) {
      activeSession = null;
      previous.unsubscribe();
      void cleanupSession(previous);
    }

    const currentGeneration = ++generation;
    const userSessionsRef = ref(database, `presence/${uid}`);
    const sessionRef = push(userSessionsRef);
    const session = {
      uid,
      sessionRef,
      unsubscribe: () => {},
      registered: false,
      connected: false,
    };
    activeSession = session;

    session.unsubscribe = onValue(
      ref(database, ".info/connected"),
      (snapshot) => {
        if (activeSession !== session || currentGeneration !== generation) return;
        session.connected = snapshot.val() === true;
        if (snapshot.val() !== true) {
          session.registered = false;
          return;
        }
        if (session.registered) return;
        session.registered = true;

        Promise.resolve(onDisconnect(sessionRef).remove())
          .then(() => {
            if (activeSession !== session || currentGeneration !== generation) return;
            return set(sessionRef, true);
          })
          .catch((error) => {
            session.registered = false;
            onError(error);
          });
      },
      onError,
    );
    return true;
  }

  async function stop() {
    const session = activeSession;
    if (!session) return;
    activeSession = null;
    generation += 1;
    session.unsubscribe();
    await cleanupSession(session);
  }

  return { start, stop };
}
