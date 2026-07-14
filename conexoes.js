"use strict";

/* ==============================
   FIREBASE
================================ */

import { db } from "./firebase-config.js";

import { authReady } from "./auth-guard.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
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

/* ==============================
   ESTADO
================================ */

let currentUser = null;

let receivedInvites = [];

let activeConnections = [];

let actionInProgress = false;

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

      const otherProfile = await loadPublicProfile(otherUserId);

      return {
        id: documentSnapshot.id,

        ...data,

        otherUserId,

        otherProfile,
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
   RENDERIZAR CONEXÕES
================================ */

function renderActiveConnections() {
  if (activeConnectionsCount) {
    activeConnectionsCount.textContent = String(activeConnections.length);
  }

  if (!activeConnectionsList) {
    return;
  }

  if (!activeConnections.length) {
    activeConnectionsList.innerHTML = `
      <p class="connections-empty">
        Suas conexões aceitas aparecerão aqui.
      </p>
    `;

    return;
  }

  activeConnectionsList.innerHTML = activeConnections
    .map((connection) => {
      const profile = connection.otherProfile || {};

      const playerName = profile.nome?.trim() || "Jogador Origo";

      return `
          <article class="connection-card">
            ${createAvatarHTML(profile, playerName)}

            <div class="connection-card-content">
              <h3 class="card-name">
                ${escapeHTML(playerName)}
              </h3>

              <p class="card-meta">
                ${escapeHTML(createProfileMeta(profile))}
              </p>

              <span class="connection-badge">
                Conexão ativa
              </span>
            </div>
          </article>
        `;
    })
    .join("");
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
