"use strict";

/* ==============================
   FIREBASE
================================ */

import { db } from "./firebase-config.js";

import { authReady } from "./auth-guard.js";

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* ==============================
   ELEMENTOS
================================ */

const loadingSection = document.getElementById("online-match-loading");

const errorSection = document.getElementById("online-match-error");

const errorMessage = document.getElementById("online-match-error-message");

const contentSection = document.getElementById("online-match-content");

const matchTcgElement = document.getElementById("online-match-tcg");

const matchFormatElement = document.getElementById("online-match-format");

const matchDateElement = document.getElementById("online-match-date");

const videoContainer = document.getElementById("online-match-video");

/* ==============================
   ESTADO
================================ */

let currentUser = null;

let jitsiApi = null;

/* ==============================
   INTERFACE
================================ */

function showLoading() {
  if (loadingSection) {
    loadingSection.hidden = false;
  }

  if (errorSection) {
    errorSection.hidden = true;
  }

  if (contentSection) {
    contentSection.hidden = true;
  }
}

function showError(message) {
  if (loadingSection) {
    loadingSection.hidden = true;
  }

  if (contentSection) {
    contentSection.hidden = true;
  }

  if (errorSection) {
    errorSection.hidden = false;
  }

  if (errorMessage) {
    errorMessage.textContent = message;
  }
}

function showContent() {
  if (loadingSection) {
    loadingSection.hidden = true;
  }

  if (errorSection) {
    errorSection.hidden = true;
  }

  if (contentSection) {
    contentSection.hidden = false;
  }
}

/* ==============================
   FORMATAÇÃO
================================ */

function formatMatchDate(value) {
  if (!value || typeof value.toDate !== "function") {
    return "Horário não informado";
  }

  const date = value.toDate();

  if (Number.isNaN(date.getTime())) {
    return "Horário não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/* ==============================
   IDENTIFICAÇÃO DA PARTIDA
================================ */

function getMatchIdFromURL() {
  const parameters = new URLSearchParams(window.location.search);

  return parameters.get("id")?.trim() || "";
}

/* ==============================
   PERFIL DO JOGADOR
================================ */

async function loadCurrentPlayerName() {
  if (!currentUser) {
    return "Jogador Origo";
  }

  try {
    const profileReference = doc(db, "perfisPublicos", currentUser.uid);

    const snapshot = await getDoc(profileReference);

    if (!snapshot.exists()) {
      return currentUser.displayName || "Jogador Origo";
    }

    const profileName = snapshot.data().nome;

    if (typeof profileName === "string" && profileName.trim()) {
      return profileName.trim();
    }

    return currentUser.displayName || "Jogador Origo";
  } catch (error) {
    console.error(
      "[Partida Online] Não foi possível carregar o perfil:",
      error,
    );

    return currentUser.displayName || "Jogador Origo";
  }
}

/* ==============================
   JITSI
================================ */

function waitForJitsiAPI() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const interval = window.setInterval(() => {
      if (typeof window.JitsiMeetExternalAPI === "function") {
        window.clearInterval(interval);

        resolve();
        return;
      }

      if (Date.now() - startedAt > 10000) {
        window.clearInterval(interval);

        reject(new Error("A API de vídeo não foi carregada."));
      }
    }, 200);
  });
}

async function openVideoRoom(match, playerName) {
  if (!videoContainer) {
    throw new Error("O espaço da videochamada não foi encontrado.");
  }

  await waitForJitsiAPI();

  showContent();

  await new Promise((resolve) => {
    window.requestAnimationFrame(resolve);
  });

  videoContainer.innerHTML = "";

  jitsiApi = new window.JitsiMeetExternalAPI("meet.jit.si", {
    roomName: match.salaId,

    parentNode: videoContainer,

    width: "100%",

    height: "100%",

    userInfo: {
      displayName: playerName,
    },

    configOverwrite: {
      disableDeepLinking: true,

      prejoinPageEnabled: true,

      startWithAudioMuted: false,

      startWithVideoMuted: false,
    },
  });
}

/* ==============================
   CARREGAR PARTIDA
================================ */

async function loadOnlineMatch() {
  showLoading();

  const matchId = getMatchIdFromURL();

  if (!matchId) {
    showError("O endereço da partida está incompleto.");

    return;
  }

  const matchReference = doc(db, "partidas", matchId);

  const matchSnapshot = await getDoc(matchReference);

  if (!matchSnapshot.exists()) {
    showError("Esta partida não foi encontrada.");

    return;
  }

  const match = matchSnapshot.data();

  const participants = Array.isArray(match.participantes)
    ? match.participantes
    : [];

  if (!participants.includes(currentUser.uid)) {
    showError("Sua conta não participa desta partida.");

    return;
  }

  if (match.modalidade !== "online") {
    showError("Esta partida não foi marcada como online.");

    return;
  }

  if (match.status !== "confirmada") {
    showError("Esta partida ainda não está confirmada.");

    return;
  }

  const validRoomId =
    typeof match.salaId === "string" &&
    /^origo-[0-9a-f]{32}$/.test(match.salaId);

  if (!validRoomId) {
    showError("A sala de vídeo desta partida é inválida.");

    return;
  }

  if (matchTcgElement) {
    matchTcgElement.textContent = match.tcg || "Não informado";
  }

  if (matchFormatElement) {
    matchFormatElement.textContent = match.formato || "Não informado";
  }

  if (matchDateElement) {
    matchDateElement.textContent = formatMatchDate(match.dataHora);
  }

  const playerName = await loadCurrentPlayerName();

  await openVideoRoom(match, playerName);
}

/* ==============================
   INICIALIZAÇÃO
================================ */

async function initializeOnlineMatch() {
  try {
    currentUser = await authReady;

    await loadOnlineMatch();
  } catch (error) {
    console.error("[Partida Online] Não foi possível abrir a sala:", error);

    showError(
      "Não foi possível carregar a sala de vídeo. Verifique sua conexão e tente novamente.",
    );
  }
}

window.addEventListener("beforeunload", () => {
  if (jitsiApi && typeof jitsiApi.dispose === "function") {
    jitsiApi.dispose();
  }
});

initializeOnlineMatch();
