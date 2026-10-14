"use strict";

import { auth, app, db, firebaseConfig } from "./firebase-config.js";
import {
  getDatabase,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import {
  doc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  createPresenceController,
  createPublicPresenceSubscriber,
} from "./presence-core.mjs";

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

const subscribeToVisiblePlayerPresence = createPublicPresenceSubscriber({
  database: realtimeDatabase,
  ref,
  onValue,
});

let activeUid = "";
let unsubscribeOwnProfile = () => {};

export function startPresence(user = auth.currentUser) {
  const uid = typeof user === "string" ? user : user?.uid;
  if (!realtimeDatabase || !uid) return false;
  if (activeUid === uid) return true;

  unsubscribeOwnProfile();
  activeUid = uid;
  if (!controller.start(uid)) return false;

  unsubscribeOwnProfile = onSnapshot(
    doc(db, "perfisPublicos", uid),
    (snapshot) => {
      const profile = snapshot.exists() ? snapshot.data() : null;
      controller.setMapVisible(
        profile?.tipo === "player" && profile.ativo === true,
      );
    },
    (error) => {
      controller.setMapVisible(false);
      console.warn("[Presença] Não foi possível confirmar a participação no mapa.", error);
    },
  );
  return true;
}

export async function stopPresence() {
  unsubscribeOwnProfile();
  unsubscribeOwnProfile = () => {};
  activeUid = "";
  await controller.stop();
}

export function subscribeToPresence(playerIds, onSnapshot, onError = () => {}) {
  if (!realtimeDatabase) {
    onError(new Error("Realtime Database ainda não foi configurado neste projeto."));
    return () => {};
  }
  if (!auth.currentUser) {
    onError(new Error("É necessário entrar para consultar a presença dos jogadores."));
    return () => {};
  }
  return subscribeToVisiblePlayerPresence(playerIds, onSnapshot, onError);
}

export const presenceConfigured = Boolean(realtimeDatabase);
