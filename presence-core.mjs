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
  const isKnown = known instanceof Set ? known.has(uid) : known;
  if (!isKnown) return "unknown";
  return onlineUserIds?.has(uid) ? "online" : "offline";
}

export function describePlayerStatus(point) {
  const connection = point.presenceState || "unknown";
  const connectionLabel = connection === "online" ? "Online" : connection === "offline" ? "Offline" : "Status desconhecido";
  const playLabel = point.available ? "Disponível para jogar" : "Não disponível para jogar";
  return `${connectionLabel} · ${playLabel}`;
}

export function applyPresenceToPoints(points, presenceByUser, known = true) {
  const onlineUserIds = onlineUserIdsFromSnapshot(presenceByUser);
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

  async function cleanupPath(pathState, session) {
    if (!session.connected) return;
    pathState.revision += 1;
    pathState.registered = false;
    if (pathState.pending) await pathState.pending;
    if (!session.connected) return;
    try {
      await remove(pathState.reference);
    } catch {
      // The server-side onDisconnect remains the fallback if the client went offline.
      return;
    }
    try {
      await onDisconnect(pathState.reference).cancel();
    } catch {
      // A stale server cleanup for this unique session key is harmless.
    }
  }

  function isCurrent(session) {
    return activeSession === session && session.generation === generation;
  }

  function registerPath(session, pathState, shouldRegister) {
    if (!isCurrent(session) || !session.connected || !shouldRegister() || pathState.registered || pathState.pending) return;

    const revision = pathState.revision;
    const connectionEpoch = session.connectionEpoch;
    pathState.pending = Promise.resolve(onDisconnect(pathState.reference).remove())
      .then(() => {
        if (!isCurrent(session) || !session.connected || !shouldRegister() || revision !== pathState.revision || connectionEpoch !== session.connectionEpoch) return;
        return set(pathState.reference, true).then(() => {
          if (isCurrent(session) && session.connected && shouldRegister() && revision === pathState.revision && connectionEpoch === session.connectionEpoch) {
            pathState.registered = true;
          }
        });
      })
      .catch(onError)
      .finally(() => {
        pathState.pending = null;
        if (!isCurrent(session) || !session.connected || pathState.registered) return;
        if (connectionEpoch !== session.connectionEpoch || (shouldRegister() && revision !== pathState.revision)) {
          registerPath(session, pathState, shouldRegister);
        }
      });
  }

  function syncSession(session) {
    registerPath(session, session.privatePath, () => true);
    registerPath(session, session.mapPath, () => session.mapVisible);
  }

  function start(uid) {
    if (!database || !uid) return false;
    if (activeSession?.uid === uid) return true;

    const previous = activeSession;
    if (previous) {
      activeSession = null;
      previous.unsubscribe();
      void cleanupPath(previous.privatePath, previous);
      void cleanupPath(previous.mapPath, previous);
    }

    const currentGeneration = ++generation;
    const userSessionsRef = ref(database, `presence/${uid}`);
    const privateSessionRef = push(userSessionsRef);
    const sessionKey = privateSessionRef.key;
    const mapSessionRef = sessionKey
      ? ref(database, `mapPresence/${uid}/${sessionKey}`)
      : push(ref(database, `mapPresence/${uid}`));
    const session = {
      uid,
      generation: currentGeneration,
      privatePath: { reference: privateSessionRef, registered: false, pending: null, revision: 0 },
      mapPath: { reference: mapSessionRef, registered: false, pending: null, revision: 0 },
      mapVisible: false,
      connected: false,
      connectionEpoch: 0,
      unsubscribe: () => {},
    };
    activeSession = session;

    let previousConnection = null;
    session.unsubscribe = onValue(
      ref(database, ".info/connected"),
      (snapshot) => {
        if (!isCurrent(session)) return;
        const connected = snapshot.val() === true;
        if (connected === previousConnection) return;
        previousConnection = connected;
        session.connected = connected;
        session.connectionEpoch += 1;
        session.privatePath.revision += 1;
        session.privatePath.registered = false;
        session.mapPath.revision += 1;
        session.mapPath.registered = false;
        if (connected) syncSession(session);
      },
      onError,
    );
    return true;
  }

  function setMapVisible(visible) {
    const session = activeSession;
    if (!session) return false;
    const nextVisibility = visible === true;
    if (session.mapVisible === nextVisibility) return true;
    session.mapVisible = nextVisibility;
    if (nextVisibility) {
      registerPath(session, session.mapPath, () => session.mapVisible);
    } else {
      void cleanupPath(session.mapPath, session);
    }
    return true;
  }

  async function stop() {
    const session = activeSession;
    if (!session) return;
    activeSession = null;
    generation += 1;
    session.unsubscribe();
    await Promise.all([
      cleanupPath(session.privatePath, session),
      cleanupPath(session.mapPath, session),
    ]);
  }

  return { start, stop, setMapVisible };
}

export function createPublicPresenceSubscriber({ database, ref, onValue }) {
  return function subscribeToPresence(playerIds, onSnapshot, onError = () => {}) {
    if (!database) return () => {};

    const ids = [...new Set((playerIds || []).filter((uid) => typeof uid === "string" && uid.trim()))];
    if (!ids.length) {
      onSnapshot({}, new Set());
      return () => {};
    }

    const presenceByUser = Object.create(null);
    const knownUserIds = new Set();
    let connected = false;

    const emit = () => onSnapshot(
      presenceByUser,
      connected ? new Set(knownUserIds) : new Set(),
    );

    const unsubscribePresence = ids.map((uid) => onValue(
      ref(database, `mapPresence/${uid}`),
      (snapshot) => {
        presenceByUser[uid] = snapshot.val() || {};
        knownUserIds.add(uid);
        emit();
      },
      (error) => {
        knownUserIds.delete(uid);
        emit();
        onError(error);
      },
    ));

    const unsubscribeConnection = onValue(
      ref(database, ".info/connected"),
      (snapshot) => {
        connected = snapshot.val() === true;
        if (!connected) {
          knownUserIds.clear();
          for (const uid of ids) delete presenceByUser[uid];
        }
        emit();
      },
      (error) => {
        connected = false;
        knownUserIds.clear();
        for (const uid of ids) delete presenceByUser[uid];
        emit();
        onError(error);
      },
    );

    return () => {
      unsubscribePresence.forEach((unsubscribe) => unsubscribe());
      unsubscribeConnection();
    };
  };
}
