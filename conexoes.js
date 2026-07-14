"use strict";

/* ==============================
   FIREBASE
================================ */

import { db } from "./firebase-config.js";

import { authReady } from "./auth-guard.js";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* ==============================
   ELEMENTOS
================================ */

const connectionsMessage = document.getElementById("connections-message");

const receivedInvitesList = document.getElementById("received-invites-list");

const receivedInvitesCount = document.getElementById("received-invites-count");

const activeConnectionsList = document.getElementById(
  "active-connections-list",
);

const activeConnectionsCount = document.getElementById(
  "active-connections-count",
);
const connectionFilterButtons = document.querySelectorAll(
  "[data-connection-filter]",
);

/* ==============================
   ESTADO
================================ */

let currentUser = null;

let receivedInvites = [];

let activeConnections = [];

let actionInProgress = false;
let classificationInProgress = false;
let activeConnectionFilter = "all";

/* ==============================
   SEGURANÇA
================================ */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ==============================
   MENSAGENS
================================ */

function showConnectionsMessage(message, type = "success") {
  if (!connectionsMessage) {
    return;
  }

  connectionsMessage.textContent = message;

  connectionsMessage.hidden = false;

  connectionsMessage.classList.remove("is-success", "is-error");

  connectionsMessage.classList.add(
    type === "error" ? "is-error" : "is-success",
  );
}

function clearConnectionsMessage() {
  if (!connectionsMessage) {
    return;
  }

  connectionsMessage.textContent = "";

  connectionsMessage.hidden = true;

  connectionsMessage.classList.remove("is-success", "is-error");
}

/* ==============================
   PERFIS PÚBLICOS
================================ */

async function loadPublicProfile(userId) {
  if (!userId) {
    return null;
  }

  try {
    const profileReference = doc(db, "perfisPublicos", userId);

    const snapshot = await getDoc(profileReference);

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data();
  } catch (error) {
    console.error("[Conexões] Não foi possível carregar o perfil:", error);

    return null;
  }
}

/* ==============================
   FORMATAÇÃO
================================ */

function getNameInitial(name) {
  const normalizedName = String(name || "").trim();

  return normalizedName ? normalizedName.charAt(0).toUpperCase() : "O";
}

function formatTimestamp(value) {
  if (!value || typeof value.toDate !== "function") {
    return "";
  }

  const date = value.toDate();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTimestampMilliseconds(value) {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  return 0;
}

function createAvatarHTML(profile, name) {
  const photoURL =
    typeof profile?.fotoURL === "string" ? profile.fotoURL.trim() : "";

  if (photoURL) {
    return `
      <div class="card-avatar">
        <img
          src="${escapeHTML(photoURL)}"
          alt=""
          loading="lazy"
        >
      </div>
    `;
  }

  return `
    <div
      class="card-avatar"
      aria-hidden="true"
    >
      ${escapeHTML(getNameInitial(name))}
    </div>
  `;
}

function createProfileMeta(profile) {
  const values = [];

  if (profile?.cidade) {
    values.push(profile.cidade);
  }

  if (profile?.tcgFavorito) {
    values.push(profile.tcgFavorito);
  }

  return values.length ? values.join(" • ") : "Jogador da comunidade Origo";
}

/* ==============================
   CARREGAR CONVITES
================================ */

async function loadReceivedInvites(userId) {
  const invitesQuery = query(
    collection(db, "convites"),

    where("destinatarioId", "==", userId),
  );

  const snapshot = await getDocs(invitesQuery);

  const pendingDocuments = snapshot.docs.filter((documentSnapshot) => {
    return documentSnapshot.data().status === "pendente";
  });

  const invitations = await Promise.all(
    pendingDocuments.map(async (documentSnapshot) => {
      const data = documentSnapshot.data();

      const senderProfile = await loadPublicProfile(data.remetenteId);

      return {
        id: documentSnapshot.id,

        ...data,

        senderProfile,
      };
    }),
  );

  invitations.sort((first, second) => {
    return (
      getTimestampMilliseconds(second.criadoEm) -
      getTimestampMilliseconds(first.criadoEm)
    );
  });

  return invitations;
}
/* ==============================
   CLASSIFICAÇÃO DA CONEXÃO
================================ */

async function loadConnectionClassification(connectionId, userId) {
  if (!connectionId || !userId) {
    return "";
  }

  try {
    const classificationReference = doc(
      db,
      "conexoes",
      connectionId,
      "classificacoes",
      userId,
    );

    const snapshot = await getDoc(classificationReference);

    if (!snapshot.exists()) {
      return "";
    }

    const classification = snapshot.data().tipo;

    return ["amigo", "rival"].includes(classification) ? classification : "";
  } catch (error) {
    console.error(
      "[Conexões] Não foi possível carregar a classificação:",
      error,
    );

    return "";
  }
}
/* ==============================
   PARTIDA DA CONEXÃO
================================ */

async function loadConnectionMatch(inviteId, userId) {
  if (!inviteId || !userId) {
    return null;
  }

  try {
    const matchReference = doc(db, "partidas", inviteId);

    const snapshot = await getDoc(matchReference);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();

    const participants = Array.isArray(data.participantes)
      ? data.participantes
      : [];

    if (!participants.includes(userId)) {
      return null;
    }

    return {
      id: snapshot.id,

      ...data,
    };
  } catch (error) {
    console.error("[Conexões] Não foi possível carregar a partida:", error);

    return null;
  }
}
/* ==============================
   CARREGAR CONEXÕES
================================ */

async function loadActiveConnections(userId) {
  const connectionsQuery = query(
    collection(db, "conexoes"),

    where("participantes", "array-contains", userId),
  );

  const snapshot = await getDocs(connectionsQuery);

  const connectionDocuments = snapshot.docs.filter((documentSnapshot) => {
    return documentSnapshot.data().ativo === true;
  });

  const connections = await Promise.all(
    connectionDocuments.map(async (documentSnapshot) => {
      const data = documentSnapshot.data();

      const otherUserId =
        data.participantes?.find((participantId) => {
          return participantId !== userId;
        }) || "";

      const [otherProfile, classification, connectionMatch] = await Promise.all(
        [
          loadPublicProfile(otherUserId),

          loadConnectionClassification(documentSnapshot.id, userId),

          loadConnectionMatch(data.conviteId, userId),
        ],
      );

      return {
        id: documentSnapshot.id,

        ...data,

        otherUserId,

        otherProfile,
        classification,
        connectionMatch,
      };
    }),
  );

  connections.sort((first, second) => {
    const firstName = first.otherProfile?.nome || "";

    const secondName = second.otherProfile?.nome || "";

    return firstName.localeCompare(secondName, "pt-BR");
  });

  return connections;
}

/* ==============================
   RENDERIZAR CONVITES
================================ */

function renderReceivedInvites() {
  if (receivedInvitesCount) {
    receivedInvitesCount.textContent = String(receivedInvites.length);
  }

  if (!receivedInvitesList) {
    return;
  }

  if (!receivedInvites.length) {
    receivedInvitesList.innerHTML = `
      <p class="connections-empty">
        Você não possui convites pendentes.
      </p>
    `;

    return;
  }

  receivedInvitesList.innerHTML = receivedInvites
    .map((invite) => {
      const profile = invite.senderProfile || {};

      const senderName = profile.nome?.trim() || "Jogador Origo";

      const dateText = formatTimestamp(invite.criadoEm);

      return `
          <article
            class="invite-card"
            data-invite-card="${escapeHTML(invite.id)}"
          >
            <div class="card-profile">
              ${createAvatarHTML(profile, senderName)}

              <div class="card-profile-content">
                <h3 class="card-name">
                  ${escapeHTML(senderName)}
                </h3>

                <p class="card-meta">
                  ${escapeHTML(createProfileMeta(profile))}
                </p>
              </div>
            </div>

            <p class="invite-message">
              ${escapeHTML(invite.mensagem)}
            </p>

            ${
              dateText
                ? `
                    <p class="invite-date">
                      Recebido em ${escapeHTML(dateText)}
                    </p>
                  `
                : ""
            }

            <div class="invite-actions">
              <button
                class="invite-reject-button"
                type="button"
                data-invite-action="reject"
                data-invite-id="${escapeHTML(invite.id)}"
              >
                Recusar
              </button>

              <button
                class="invite-accept-button"
                type="button"
                data-invite-action="accept"
                data-invite-id="${escapeHTML(invite.id)}"
              >
                Aceitar
              </button>
            </div>
          </article>
        `;
    })
    .join("");
}
/* ==============================
   FILTROS DAS CONEXÕES
================================ */

function getFilteredConnections() {
  if (activeConnectionFilter === "all") {
    return activeConnections;
  }

  return activeConnections.filter((connection) => {
    return connection.classification === activeConnectionFilter;
  });
}

function updateConnectionFilterButtons() {
  connectionFilterButtons.forEach((button) => {
    const isActive = button.dataset.connectionFilter === activeConnectionFilter;

    button.classList.toggle("is-active", isActive);

    button.setAttribute("aria-pressed", String(isActive));
  });
}

function getEmptyConnectionsMessage() {
  const messages = {
    all: "Suas conexões aceitas aparecerão aqui.",

    amigo: "Nenhuma conexão foi classificada como amigo.",

    rival: "Nenhuma conexão foi classificada como rival.",
  };

  return messages[activeConnectionFilter] || messages.all;
}
/* ==============================
   RENDERIZAR CONEXÕES
================================ */

function renderActiveConnections() {
  if (activeConnectionsCount) {
    activeConnectionsCount.textContent = String(activeConnections.length);
  }

  if (!activeConnectionsList) {
    return;
  }

  updateConnectionFilterButtons();

  const filteredConnections = getFilteredConnections();

  if (!filteredConnections.length) {
    activeConnectionsList.innerHTML = `
      <p class="connections-empty">
        ${escapeHTML(getEmptyConnectionsMessage())}
      </p>
    `;

    return;
  }

  activeConnectionsList.innerHTML = filteredConnections
    .map((connection) => {
      const profile = connection.otherProfile || {};

      const playerName = profile.nome?.trim() || "Jogador Origo";

      const classification = connection.classification || "";

      const connectionMatch = connection.connectionMatch || null;

      const onlineMatchButton =
        connectionMatch?.modalidade === "online" &&
        connectionMatch?.status === "confirmada" &&
        connectionMatch?.id
          ? `
        <a
          class="connection-online-match-button"
          href="partida-online.html?id=${escapeHTML(
            encodeURIComponent(connectionMatch.id),
          )}"
        >
          Entrar na sala
        </a>
      `
          : "";

      const classificationBadge =
        classification === "amigo"
          ? `
                <span class="connection-badge is-friend">
                  Amigo
                </span>
              `
          : classification === "rival"
            ? `
                  <span class="connection-badge is-rival">
                    Rival
                  </span>
                `
            : "";

      return `
          <article
            class="connection-card"
            data-connection-card="${escapeHTML(connection.id)}"
          >
            ${createAvatarHTML(profile, playerName)}

            <div class="connection-card-content">
              <h3 class="card-name">
                ${escapeHTML(playerName)}
              </h3>

              <p class="card-meta">
                ${escapeHTML(createProfileMeta(profile))}
              </p>

              ${classificationBadge}

${onlineMatchButton}

<div
  class="connection-classification"
                role="group"
                aria-label="Classificar ${escapeHTML(playerName)}"
              >
                <button
                  class="classification-button ${
                    classification === "amigo" ? "is-selected" : ""
                  }"
                  type="button"
                  data-connection-id="${escapeHTML(connection.id)}"
                  data-connection-classification="amigo"
                  aria-pressed="${classification === "amigo"}"
                >
                  Amigo
                </button>

                <button
                  class="classification-button ${
                    classification === "rival" ? "is-selected is-rival" : ""
                  }"
                  type="button"
                  data-connection-id="${escapeHTML(connection.id)}"
                  data-connection-classification="rival"
                  aria-pressed="${classification === "rival"}"
                >
                  Rival
                </button>

                <button
                  class="classification-button classification-clear-button"
                  type="button"
                  data-connection-id="${escapeHTML(connection.id)}"
                  data-connection-classification=""
                  aria-pressed="${classification === ""}"
                >
                  Remover
                </button>
              </div>
            </div>
          </article>
        `;
    })
    .join("");
}
/* ==============================
   PREPARAÇÃO DAS PARTIDAS
================================ */

function inviteHasCompleteMatchDetails(invitation) {
  if (!invitation) {
    return false;
  }

  const validModality = ["presencial", "online"].includes(
    invitation.modalidade,
  );

  const validTcg =
    typeof invitation.tcg === "string" && invitation.tcg.trim().length >= 2;

  const validFormat =
    typeof invitation.formato === "string" &&
    invitation.formato.trim().length >= 2;

  const validDateTime =
    invitation.dataHoraProposta &&
    typeof invitation.dataHoraProposta.toDate === "function";

  const validLocation =
    invitation.modalidade === "online"
      ? invitation.local === ""
      : typeof invitation.local === "string" &&
        invitation.local.trim().length >= 2;

  return (
    validModality && validTcg && validFormat && validDateTime && validLocation
  );
}

function createSecureVideoRoomId() {
  const randomValues = new Uint32Array(4);

  window.crypto.getRandomValues(randomValues);

  const randomCode = Array.from(randomValues)
    .map((value) => {
      return value.toString(16).padStart(8, "0");
    })
    .join("");

  return `origo-${randomCode}`;
}
/* ==============================
   AÇÕES DOS CONVITES
================================ */

function setInviteCardLoading(inviteId, action) {
  const card = receivedInvitesList?.querySelector(
    `[data-invite-card="${CSS.escape(inviteId)}"]`,
  );

  if (!card) {
    return;
  }

  const buttons = card.querySelectorAll("[data-invite-action]");

  buttons.forEach((button) => {
    button.disabled = true;

    if (button.dataset.inviteAction === action) {
      button.textContent =
        action === "accept" ? "Aceitando..." : "Recusando...";
    }
  });
}

async function respondToInvite(inviteId, action) {
  if (actionInProgress || !currentUser) {
    return;
  }

  const invitation = receivedInvites.find((invite) => invite.id === inviteId);

  if (!invitation) {
    showConnectionsMessage("O convite não foi encontrado.", "error");

    return;
  }

  if (invitation.destinatarioId !== currentUser.uid) {
    showConnectionsMessage("Este convite não pertence à sua conta.", "error");

    return;
  }

  clearConnectionsMessage();

  actionInProgress = true;

  setInviteCardLoading(inviteId, action);

  try {
    const inviteReference = doc(db, "convites", inviteId);

    const batch = writeBatch(db);

    if (action === "accept") {
      const participants = [
        invitation.remetenteId,
        invitation.destinatarioId,
      ].sort();

      const connectionId = participants.join("__");

      const connectionReference = doc(db, "conexoes", connectionId);
      const hasCompleteMatchDetails = inviteHasCompleteMatchDetails(invitation);

      const matchReference = hasCompleteMatchDetails
        ? doc(db, "partidas", inviteId)
        : null;

      const videoRoomId =
        hasCompleteMatchDetails && invitation.modalidade === "online"
          ? createSecureVideoRoomId()
          : "";

      batch.update(inviteReference, {
        status: "aceito",

        atualizadoEm: serverTimestamp(),
      });

      batch.set(
        connectionReference,
        {
          participantes: participants,

          conviteId: inviteId,

          ativo: true,

          atualizadoEm: serverTimestamp(),
        },
        {
          merge: true,
        },
      );
      if (matchReference) {
        batch.set(matchReference, {
          participantes: participants,

          conviteId: inviteId,

          modalidade: invitation.modalidade,

          tcg: invitation.tcg.trim(),

          formato: invitation.formato.trim(),

          dataHora: invitation.dataHoraProposta,

          local:
            invitation.modalidade === "presencial"
              ? invitation.local.trim()
              : "",

          salaId: videoRoomId,

          status: "confirmada",

          criadoEm: serverTimestamp(),

          atualizadoEm: serverTimestamp(),
        });
      }
    } else {
      batch.update(inviteReference, {
        status: "recusado",

        atualizadoEm: serverTimestamp(),
      });
    }

    await batch.commit();

    showConnectionsMessage(
      action === "accept"
        ? "Convite aceito! Uma nova conexão foi criada."
        : "Convite recusado.",
      "success",
    );

    await loadConnectionsPageData();
  } catch (error) {
    console.error("[Conexões] Não foi possível responder ao convite:", error);

    showConnectionsMessage(
      error?.code === "permission-denied"
        ? "O Firebase bloqueou esta ação. Confira as regras publicadas."
        : "Não foi possível responder ao convite.",
      "error",
    );

    renderReceivedInvites();
  } finally {
    actionInProgress = false;
  }
}
/* ==============================
   SALVAR CLASSIFICAÇÃO
================================ */

function setClassificationLoading(connectionId, isLoading) {
  const card = activeConnectionsList?.querySelector(
    `[data-connection-card="${CSS.escape(connectionId)}"]`,
  );

  if (!card) {
    return;
  }

  const buttons = card.querySelectorAll("[data-connection-classification]");

  buttons.forEach((button) => {
    button.disabled = isLoading;
  });
}

async function saveConnectionClassification(connectionId, classification) {
  if (classificationInProgress || !currentUser) {
    return;
  }

  if (classification && !["amigo", "rival"].includes(classification)) {
    return;
  }

  const connection = activeConnections.find((item) => item.id === connectionId);

  if (!connection) {
    showConnectionsMessage("A conexão não foi encontrada.", "error");

    return;
  }

  clearConnectionsMessage();

  classificationInProgress = true;

  setClassificationLoading(connectionId, true);

  try {
    const classificationReference = doc(
      db,
      "conexoes",
      connectionId,
      "classificacoes",
      currentUser.uid,
    );

    if (classification) {
      await setDoc(classificationReference, {
        tipo: classification,

        atualizadoEm: serverTimestamp(),
      });
    } else {
      await deleteDoc(classificationReference);
    }

    connection.classification = classification;

    renderActiveConnections();

    const successMessages = {
      amigo: "Conexão classificada como amigo.",

      rival: "Conexão classificada como rival.",
    };

    showConnectionsMessage(
      successMessages[classification] || "Classificação removida.",
      "success",
    );
  } catch (error) {
    console.error("[Conexões] Não foi possível salvar a classificação:", error);

    showConnectionsMessage(
      error?.code === "permission-denied"
        ? "O Firebase bloqueou a classificação. Confira as regras publicadas."
        : "Não foi possível salvar a classificação.",
      "error",
    );

    setClassificationLoading(connectionId, false);
  } finally {
    classificationInProgress = false;
  }
}
/* ==============================
   EVENTOS
================================ */

receivedInvitesList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-invite-action]");

  if (!button) {
    return;
  }

  const inviteId = button.dataset.inviteId || "";

  const action = button.dataset.inviteAction || "";

  if (!inviteId || !["accept", "reject"].includes(action)) {
    return;
  }

  respondToInvite(inviteId, action);
});
activeConnectionsList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-connection-classification]");

  if (!button) {
    return;
  }

  const connectionId = button.dataset.connectionId || "";

  const classification = button.dataset.connectionClassification || "";

  if (!connectionId) {
    return;
  }

  saveConnectionClassification(connectionId, classification);
});
connectionFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedFilter = button.dataset.connectionFilter || "";

    if (!["all", "amigo", "rival"].includes(selectedFilter)) {
      return;
    }

    activeConnectionFilter = selectedFilter;

    renderActiveConnections();
  });
});
/* ==============================
   CARREGAMENTO GERAL
================================ */

async function loadConnectionsPageData() {
  if (!currentUser) {
    return;
  }

  if (receivedInvitesList) {
    receivedInvitesList.innerHTML = `
      <p class="connections-loading">
        Carregando convites...
      </p>
    `;
  }

  if (activeConnectionsList) {
    activeConnectionsList.innerHTML = `
      <p class="connections-loading">
        Carregando conexões...
      </p>
    `;
  }

  try {
    const [invitations, connections] = await Promise.all([
      loadReceivedInvites(currentUser.uid),

      loadActiveConnections(currentUser.uid),
    ]);

    receivedInvites = invitations;

    activeConnections = connections;

    renderReceivedInvites();

    renderActiveConnections();
  } catch (error) {
    console.error("[Conexões] Não foi possível carregar a página:", error);

    showConnectionsMessage(
      error?.code === "permission-denied"
        ? "O Firebase bloqueou o carregamento das conexões."
        : "Não foi possível carregar suas conexões.",
      "error",
    );

    if (receivedInvitesList) {
      receivedInvitesList.innerHTML = `
        <p class="connections-empty">
          Não foi possível carregar os convites.
        </p>
      `;
    }

    if (activeConnectionsList) {
      activeConnectionsList.innerHTML = `
        <p class="connections-empty">
          Não foi possível carregar as conexões.
        </p>
      `;
    }
  }
}

/* ==============================
   INICIALIZAÇÃO
================================ */

async function initializeConnectionsPage() {
  try {
    currentUser = await authReady;

    await loadConnectionsPageData();
  } catch (error) {
    console.error("[Conexões] Falha na inicialização:", error);

    showConnectionsMessage("Não foi possível identificar sua conta.", "error");
  }
}

initializeConnectionsPage();
