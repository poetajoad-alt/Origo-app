"use strict";

import { auth, app, firebaseConfig } from "./firebase-config.js";
import {
  getDatabase,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { createPresenceController } from "./presence-core.mjs";

const databaseUrl = typeof firebaseConfig.databaseURL === "string"
  ? firebaseConfig.databaseURL.trim()
  : "";

let realtimeDatabase = null;
try {
  if (databaseUrl) realtimeDatabase = getDatabase(app, databaseUrl);
} catch (error) {
  console.error("[Presença] A URL do Realtime Database é inválida.", error);
}

const controller = createPresenceController({
  database: realtimeDatabase,
  ref,
  push,
  onValue,
  onDisconnect,
  set,
  remove,
  onError: (error) => console.error("[Presença] Não foi possível atualizar a sessão:", error),
});

export function startPresence(user = auth.currentUser) {
  const uid = typeof user === "string" ? user : user?.uid;
  return controller.start(uid);
}

export function stopPresence() {
  return controller.stop();
}

export function subscribeToPresence(onSnapshot, onError = () => {}) {
  if (!realtimeDatabase) {
    onError(new Error("Realtime Database ainda não foi configurado neste projeto."));
    return () => {};
  }
  if (!auth.currentUser) {
    onError(new Error("É necessário entrar para consultar a presença dos jogadores."));
    return () => {};
  }

  let currentPresence = null;
  let connected = false;
  const emit = () => onSnapshot(currentPresence || {}, connected && currentPresence !== null);
  const handleError = (error) => {
    connected = false;
    emit();
    onError(error);
  };

  const unsubscribePresence = onValue(
    ref(realtimeDatabase, "presence"),
    (snapshot) => {
      currentPresence = snapshot.val() || {};
      emit();
    },
    handleError,
  );
  const unsubscribeConnection = onValue(
    ref(realtimeDatabase, ".info/connected"),
    (snapshot) => {
      connected = snapshot.val() === true;
      emit();
    },
    handleError,
  );
  return () => {
    unsubscribePresence();
    unsubscribeConnection();
  };
}

export const presenceConfigured = Boolean(realtimeDatabase);
