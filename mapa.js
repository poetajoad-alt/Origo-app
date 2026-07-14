"use strict";

/* ==============================
   FIREBASE
================================ */

import { db } from "./firebase-config.js";
import { authReady } from "./auth-guard.js";

import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

const auth = getAuth();

/* ==============================
   CONFIGURAÇÕES
================================ */

const MAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">' +
  "OpenStreetMap</a> contributors";

const DEFAULT_MAP_CENTER = [-23.4543, -46.5337];

const DEFAULT_MAP_ZOOM = 13;

/* ==============================
   LOJA TEMPORÁRIA
================================ */

const temporaryMapPoints = [
  {
    id: "store-demo-1",

    type: "store",

    name: "Loja demonstrativa",

    latitude: -23.4572,

    longitude: -46.5255,

    available: false,

    subtitle: "Exemplo de loja parceira da Origo",

    details: {
      Cidade: "Guarulhos, SP",
      Horário: "10h às 20h",
      TCGs: "Pokémon, Magic e Yu-Gi-Oh!",
    },
  },
];

/* ==============================
   ELEMENTOS
================================ */

const mapPage = document.querySelector(".map-page");

const mapElement = document.getElementById("community-map");

const filterButtons = document.querySelectorAll("[data-map-filter]");

const locateUserButton = document.getElementById("locate-user-button");

const mapStatus = document.getElementById("map-status");

const bottomSheet = document.getElementById("map-bottom-sheet");

const bottomSheetCloseButton = document.getElementById("map-sheet-close");

const bottomSheetType = document.getElementById("map-sheet-type");

const bottomSheetAvailability = document.getElementById(
  "map-sheet-availability",
);

const bottomSheetTitle = document.getElementById("map-sheet-title");

const bottomSheetSubtitle = document.getElementById("map-sheet-subtitle");

const bottomSheetDetails = document.getElementById("map-sheet-details");
const bottomSheetActions = document.getElementById("map-sheet-actions");

const inviteToPlayButton = document.getElementById("map-sheet-invite-button");
const inviteLayer = document.getElementById("invite-layer");

const inviteOverlay = document.getElementById("invite-overlay");

const inviteCloseButton = document.getElementById("invite-close-button");

const inviteRecipientName = document.getElementById("invite-recipient-name");
const inviteModalityButtons = document.querySelectorAll(
  "[data-invite-modality]",
);

const inviteMessageButtons = document.querySelectorAll("[data-invite-message]");

const inviteCancelButton = document.getElementById("invite-cancel-button");

const inviteSendButton = document.getElementById("invite-send-button");

/* ==============================
   ESTADO
================================ */

let communityMap = null;
let currentFilter = "all";

let userLocationMarker = null;
let userAccuracyCircle = null;

let statusTimer = null;

let allMapPoints = [];
let selectedPlayerPoint = null;
let currentUserId = "";
let selectedInviteModality = "";
let selectedInviteMessage = "";

let inviteIsSubmitting = false;

const mapLayers = {
  player: null,
  store: null,
  event: null,
};

/* ==============================
   MENSAGENS
================================ */

function showMapStatus(message, duration = 4000) {
  if (!mapStatus) {
    return;
  }

  window.clearTimeout(statusTimer);

  mapStatus.textContent = message;
  mapStatus.hidden = false;

  if (duration <= 0) {
    return;
  }

  statusTimer = window.setTimeout(() => {
    mapStatus.hidden = true;
  }, duration);
}

/* ==============================
   SEGURANÇA DO HTML
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
   MARCADORES
================================ */

function getMarkerConfiguration(type) {
  const configurations = {
    player: {
      color: "#187498",

      icon: `
        <circle
          cx="24"
          cy="18"
          r="5"
          fill="#ffffff"
        />

        <path
          d="
            M14 35
            C15 28 18.8 24 24 24
            C29.2 24 33 28 34 35
            Z
          "
          fill="#ffffff"
        />
      `,
    },

    store: {
      color: "#F9D923",

      icon: `
        <path
          d="M14 20H34L32 14H16L14 20Z"
          fill="#082632"
        />

        <path
          d="M16 21V35H32V21"
          fill="none"
          stroke="#082632"
          stroke-width="3"
          stroke-linejoin="round"
        />

        <path
          d="M22 27H27V35H22Z"
          fill="#082632"
        />
      `,
    },

    event: {
      color: "#EB5353",

      icon: `
        <rect
          x="14"
          y="15"
          width="20"
          height="20"
          rx="3"
          fill="none"
          stroke="#ffffff"
          stroke-width="3"
        />

        <path
          d="M14 22H34"
          stroke="#ffffff"
          stroke-width="3"
        />

        <path
          d="M19 12V18M29 12V18"
          stroke="#ffffff"
          stroke-width="3"
          stroke-linecap="round"
        />

        <circle
          cx="20"
          cy="27"
          r="1.7"
          fill="#ffffff"
        />

        <circle
          cx="28"
          cy="27"
          r="1.7"
          fill="#ffffff"
        />
      `,
    },
  };

  return configurations[type] || configurations.player;
}

function createMarkerIcon(type, isAvailable = false) {
  const configuration = getMarkerConfiguration(type);

  const availabilityStatus = isAvailable
    ? `
        <span
          class="origo-marker-status"
          aria-hidden="true"
        ></span>
      `
    : "";

  return L.divIcon({
    className: "origo-div-icon",

    html: `
      <div
        class="origo-map-marker"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 48 58"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="
              M24 1
              C11.3 1 1 11.3 1 24
              C1 40 24 57 24 57
              C24 57 47 40 47 24
              C47 11.3 36.7 1 24 1
              Z
            "
            fill="${configuration.color}"
            stroke="#ffffff"
            stroke-width="2"
          />

          <circle
            cx="24"
            cy="24"
            r="14"
            fill="rgba(8, 38, 50, 0.18)"
          />

          ${configuration.icon}
        </svg>

        ${availabilityStatus}
      </div>
    `,

    iconSize: [48, 58],
    iconAnchor: [24, 56],
  });
}

/* ==============================
   PERFIS PÚBLICOS
================================ */

function normalizePublicProfile(documentSnapshot) {
  const data = documentSnapshot.data();

  const latitude = Number(data.latitude);

  const longitude = Number(data.longitude);

  if (
    data.ativo !== true ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const details = {};

  if (data.tcgFavorito) {
    details["TCG favorito"] = data.tcgFavorito;
  }

  if (data.personagemFavorito) {
    details.Personagem = data.personagemFavorito;
  }

  if (data.deckUtilizado) {
    details.Deck = data.deckUtilizado;
  }

  if (data.cidade) {
    details.Cidade = data.cidade;
  }

  return {
    id: documentSnapshot.id,

    type: "player",

    name: data.nome?.trim() || "Jogador Origo",

    latitude,
    longitude,

    available: data.disponivel === true,

    photoURL: data.fotoURL?.trim() || "",

    subtitle:
      data.disponivel === true
        ? "Disponível para jogar"
        : "Jogador da comunidade",

    details,
  };
}

async function loadPublicPlayers() {
  await authReady;

  const publicProfilesQuery = query(
    collection(db, "perfisPublicos"),

    where("ativo", "==", true),
  );

  const snapshot = await getDocs(publicProfilesQuery);

  return snapshot.docs.map(normalizePublicProfile).filter(Boolean);
}

/* ==============================
   DATAS DOS EVENTOS
================================ */

function formatEventDate(value) {
  if (!value) {
    return "Data a definir";
  }

  let eventDate = null;

  if (value instanceof Date) {
    eventDate = value;
  }

  if (
    !eventDate &&
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    eventDate = value.toDate();
  }

  if (!eventDate && typeof value === "string") {
    const normalizedValue = value.includes("T") ? value : `${value}T12:00:00`;

    eventDate = new Date(normalizedValue);
  }

  if (!eventDate || Number.isNaN(eventDate.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(eventDate);
}

/* ==============================
   EVENTOS DO FIREBASE
================================ */

function normalizeEventDocument(documentSnapshot) {
  const data = documentSnapshot.data();

  const latitude = Number(data.latitude);

  const longitude = Number(data.longitude);

  const eventTitle = typeof data.titulo === "string" ? data.titulo.trim() : "";

  if (
    data.ativo !== true ||
    !eventTitle ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const startDate =
    typeof data.dataHoraInicio?.toDate === "function"
      ? data.dataHoraInicio.toDate()
      : null;

  const category =
    typeof data.categoria === "string" ? data.categoria.trim() : "";

  const location = typeof data.local === "string" ? data.local.trim() : "";

  const city = typeof data.cidade === "string" ? data.cidade.trim() : "";

  const description =
    typeof data.descricao === "string" ? data.descricao.trim() : "";

  const format = typeof data.formato === "string" ? data.formato.trim() : "";

  const image = typeof data.imagem === "string" ? data.imagem.trim() : "";

  const legacyTime =
    typeof data.horario === "string" ? data.horario.trim() : "";

  const time = startDate
    ? `${String(startDate.getHours()).padStart(2, "0")}:${String(
        startDate.getMinutes(),
      ).padStart(2, "0")}`
    : legacyTime;

  const details = {};

  if (category) {
    details.Categoria = category;
  }

  details.Data = formatEventDate(startDate || data.data);

  if (time) {
    details.Horário = time;
  }

  if (location) {
    details.Local = location;
  }

  if (city) {
    details.Cidade = city;
  }

  if (format) {
    details.Formato = format;
  }

  if (description) {
    details.Descrição = description;
  }

  return {
    id: documentSnapshot.id,

    type: "event",

    name: eventTitle,

    latitude,
    longitude,

    available: false,

    image,

    subtitle: location || city || category || "Evento da comunidade",

    details,

    startDate,
  };
}

async function loadActiveEvents() {
  await authReady;

  const activeEventsQuery = query(
    collection(db, "eventos"),

    where("ativo", "==", true),
  );

  const snapshot = await getDocs(activeEventsQuery);

  return snapshot.docs.map(normalizeEventDocument).filter(Boolean);
}

/* ==============================
   DETALHES
================================ */

function getPointTypeLabel(type) {
  const labels = {
    player: "Jogador",
    store: "Loja",
    event: "Evento",
  };

  return labels[type] || "Local";
}

function createDetailHTML(label, value) {
  return `
    <div class="map-sheet-detail">
      <strong>
        ${escapeHTML(label)}
      </strong>

      <span>
        ${escapeHTML(value)}
      </span>
    </div>
  `;
}

function openPointDetails(point) {
  if (
    !bottomSheet ||
    !bottomSheetType ||
    !bottomSheetTitle ||
    !bottomSheetSubtitle ||
    !bottomSheetDetails
  ) {
    return;
  }

  bottomSheetType.textContent = getPointTypeLabel(point.type);

  bottomSheetType.classList.remove("type-store", "type-event");

  if (point.type === "store") {
    bottomSheetType.classList.add("type-store");
  }

  if (point.type === "event") {
    bottomSheetType.classList.add("type-event");
  }

  if (bottomSheetAvailability) {
    bottomSheetAvailability.hidden = !point.available;
  }

  bottomSheetTitle.textContent = point.name;

  bottomSheetSubtitle.textContent = point.subtitle || "";
  selectedPlayerPoint = point.type === "player" ? point : null;

  if (bottomSheetActions) {
    const isOwnProfile = point.type === "player" && point.id === currentUserId;

    const shouldShowInviteButton = point.type === "player" && !isOwnProfile;

    bottomSheetActions.hidden = !shouldShowInviteButton;

    if (inviteToPlayButton) {
      inviteToPlayButton.disabled = !point.available;

      inviteToPlayButton.textContent = point.available
        ? "Convidar para Jogar"
        : "Jogador indisponível";
    }
  }

  const detailEntries = Object.entries(point.details || {}).filter(
    ([, value]) => {
      return String(value ?? "").trim();
    },
  );

  bottomSheetDetails.innerHTML = detailEntries.length
    ? detailEntries
        .map(([label, value]) => {
          return createDetailHTML(label, value);
        })
        .join("")
    : `
        <p class="map-sheet-empty">
          Nenhuma informação adicional disponível.
        </p>
      `;

  bottomSheet.classList.add("is-open");

  bottomSheet.setAttribute("aria-hidden", "false");

  mapPage?.classList.add("sheet-open");

  communityMap?.panTo([point.latitude, point.longitude], {
    animate: true,
  });
}

function closePointDetails() {
  selectedPlayerPoint = null;

  if (bottomSheetActions) {
    bottomSheetActions.hidden = true;
  }

  if (inviteToPlayButton) {
    inviteToPlayButton.disabled = false;
    inviteToPlayButton.textContent = "Convidar para Jogar";
  }

  bottomSheet?.classList.remove("is-open");

  bottomSheet?.setAttribute("aria-hidden", "true");

  mapPage?.classList.remove("sheet-open");
}
/* ==============================
   CONVITES
================================ */

function resetInvitePanel() {
  selectedInviteModality = "";
  selectedInviteMessage = "";

  inviteModalityButtons.forEach((button) => {
    button.classList.remove("is-selected");

    button.setAttribute("aria-pressed", "false");

    button.disabled = false;
  });

  inviteMessageButtons.forEach((button) => {
    button.classList.remove("is-selected");

    button.setAttribute("aria-pressed", "false");

    button.disabled = false;

    button.hidden = true;
  });

  if (inviteSendButton) {
    inviteSendButton.disabled = true;
    inviteSendButton.textContent = "Enviar convite";
  }

  if (inviteCancelButton) {
    inviteCancelButton.disabled = false;
  }
}
function selectInviteModality(button) {
  if (!button || inviteIsSubmitting) {
    return;
  }

  const modality = button.dataset.inviteModality || "";

  if (!["presencial", "online"].includes(modality)) {
    return;
  }

  selectedInviteModality = modality;
  selectedInviteMessage = "";

  inviteModalityButtons.forEach((otherButton) => {
    const isSelected = otherButton === button;

    otherButton.classList.toggle("is-selected", isSelected);

    otherButton.setAttribute("aria-pressed", String(isSelected));
  });

  inviteMessageButtons.forEach((messageButton) => {
    const shouldShow = messageButton.dataset.inviteFor === modality;

    messageButton.hidden = !shouldShow;
    messageButton.disabled = !shouldShow;

    messageButton.classList.remove("is-selected");

    messageButton.setAttribute("aria-pressed", "false");
  });

  if (inviteSendButton) {
    inviteSendButton.disabled = true;
  }

  window.setTimeout(() => {
    const firstVisibleMessage = Array.from(inviteMessageButtons).find(
      (messageButton) => {
        return !messageButton.hidden;
      },
    );

    firstVisibleMessage?.focus();
  }, 50);
}
function openInvitePanel() {
  if (!selectedPlayerPoint) {
    showMapStatus("Nenhum jogador foi selecionado.", 5000);

    return;
  }

  if (selectedPlayerPoint.type !== "player") {
    showMapStatus("Este ponto não representa um jogador.", 5000);

    return;
  }

  if (!inviteLayer) {
    showMapStatus("O painel de convite não foi encontrado no mapa.html.", 7000);

    return;
  }

  if (!selectedPlayerPoint.available) {
    showMapStatus("Este jogador não está disponível no momento.", 5000);

    return;
  }

  if (currentUserId && selectedPlayerPoint.id === currentUserId) {
    showMapStatus(
      "Você não pode enviar um convite para seu próprio perfil.",
      5000,
    );

    return;
  }

  resetInvitePanel();

  if (inviteRecipientName) {
    inviteRecipientName.textContent = selectedPlayerPoint.name;
  }

  inviteLayer.hidden = false;

  inviteLayer.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    inviteModalityButtons[0]?.focus();
  }, 50);
}

function closeInvitePanel({ restoreFocus = true } = {}) {
  if (!inviteLayer || inviteIsSubmitting) {
    return;
  }

  inviteLayer.hidden = true;

  inviteLayer.setAttribute("aria-hidden", "true");

  resetInvitePanel();

  if (restoreFocus) {
    inviteToPlayButton?.focus();
  }
}

function selectInviteMessage(button) {
  if (!button || inviteIsSubmitting) {
    return;
  }

  selectedInviteMessage = button.dataset.inviteMessage || "";

  inviteMessageButtons.forEach((otherButton) => {
    const isSelected = otherButton === button;

    otherButton.classList.toggle("is-selected", isSelected);

    otherButton.setAttribute("aria-pressed", String(isSelected));
  });

  if (inviteSendButton) {
    inviteSendButton.disabled = !selectedInviteMessage;
  }
}

async function pendingInviteExists(senderId, recipientId) {
  const sentInvitesQuery = query(
    collection(db, "convites"),

    where("remetenteId", "==", senderId),
  );

  const snapshot = await getDocs(sentInvitesQuery);

  return snapshot.docs.some((documentSnapshot) => {
    const data = documentSnapshot.data();

    return data.destinatarioId === recipientId && data.status === "pendente";
  });
}

function setInviteSubmitting(isSubmitting) {
  inviteIsSubmitting = isSubmitting;

  inviteModalityButtons.forEach((button) => {
    button.disabled = isSubmitting;
  });

  inviteMessageButtons.forEach((button) => {
    const belongsToSelectedModality =
      button.dataset.inviteFor === selectedInviteModality;

    button.disabled = isSubmitting || !belongsToSelectedModality;
  });

  if (inviteCancelButton) {
    inviteCancelButton.disabled = isSubmitting;
  }

  if (inviteSendButton) {
    inviteSendButton.disabled =
      isSubmitting || !selectedInviteModality || !selectedInviteMessage;

    inviteSendButton.textContent = isSubmitting
      ? "Enviando..."
      : "Enviar convite";
  }
}
async function sendInvite() {
  if (
    inviteIsSubmitting ||
    !selectedPlayerPoint ||
    !selectedInviteModality ||
    !selectedInviteMessage
  ) {
    return;
  }

  const currentUser = auth.currentUser;

  if (!currentUser) {
    showMapStatus("Não foi possível identificar sua conta.", 5000);

    return;
  }

  if (selectedPlayerPoint.id === currentUser.uid) {
    showMapStatus("Você não pode convidar seu próprio perfil.", 5000);

    return;
  }

  setInviteSubmitting(true);

  try {
    const alreadyExists = await pendingInviteExists(
      currentUser.uid,
      selectedPlayerPoint.id,
    );

    if (alreadyExists) {
      setInviteSubmitting(false);

      closeInvitePanel({
        restoreFocus: false,
      });

      showMapStatus(
        `Você já possui um convite pendente para ${selectedPlayerPoint.name}.`,
        5000,
      );

      return;
    }
    const recipientName = selectedPlayerPoint.name;
    await addDoc(collection(db, "convites"), {
      remetenteId: currentUser.uid,

      destinatarioId: selectedPlayerPoint.id,

      tipo: "jogar",

      modalidade: selectedInviteModality,

      mensagem: selectedInviteMessage,

      status: "pendente",

      criadoEm: serverTimestamp(),

      atualizadoEm: serverTimestamp(),
    });

    setInviteSubmitting(false);

    closeInvitePanel({
      restoreFocus: false,
    });

    closePointDetails();

    showMapStatus(`Convite enviado para ${recipientName}.`, 5000);
  } catch (error) {
    console.error("[Convites] Não foi possível enviar o convite:", error);

    setInviteSubmitting(false);

    const errorMessages = {
      "permission-denied": "Você não tem permissão para enviar este convite.",

      unavailable: "O serviço está temporariamente indisponível.",
    };

    showMapStatus(
      errorMessages[error?.code] || "Não foi possível enviar o convite.",
      5000,
    );
  }
}
/* ==============================
   ADICIONAR PONTOS
================================ */

function addPointToMap(point) {
  const targetLayer = mapLayers[point.type];

  if (!targetLayer) {
    return;
  }

  const marker = L.marker([point.latitude, point.longitude], {
    icon: createMarkerIcon(point.type, point.available),

    title: point.name,
  });

  marker.on("click", () => {
    openPointDetails(point);
  });

  marker.addTo(targetLayer);
}

/* ==============================
   FILTROS
================================ */

function removeAllCommunityLayers() {
  Object.values(mapLayers).forEach((layer) => {
    if (layer && communityMap?.hasLayer(layer)) {
      communityMap.removeLayer(layer);
    }
  });
}

function updateFilterButtons(filter) {
  filterButtons.forEach((button) => {
    const isActive = button.dataset.mapFilter === filter;

    button.classList.toggle("is-active", isActive);

    button.setAttribute("aria-pressed", String(isActive));
  });
}

function showMapFilter(filter) {
  if (!communityMap) {
    return;
  }

  currentFilter = filter;

  removeAllCommunityLayers();

  if (filter === "all") {
    Object.values(mapLayers).forEach((layer) => {
      layer?.addTo(communityMap);
    });
  } else {
    mapLayers[filter]?.addTo(communityMap);
  }

  updateFilterButtons(filter);

  closePointDetails();
}

/* ==============================
   CENTRALIZAÇÃO
================================ */

function fitMapToPoints(points) {
  if (!communityMap || !points.length) {
    return;
  }

  const validCoordinates = points
    .map((point) => {
      return [point.latitude, point.longitude];
    })
    .filter(([latitude, longitude]) => {
      return Number.isFinite(latitude) && Number.isFinite(longitude);
    });

  if (!validCoordinates.length) {
    return;
  }

  if (validCoordinates.length === 1) {
    communityMap.setView(validCoordinates[0], 14);

    return;
  }

  const bounds = L.latLngBounds(validCoordinates);

  communityMap.fitBounds(bounds, {
    padding: [45, 45],
    maxZoom: 14,
  });
}

/* ==============================
   LOCALIZAÇÃO DO USUÁRIO
================================ */

function createUserLocationIcon() {
  return L.divIcon({
    className: "origo-div-icon",

    html: `
      <div
        class="user-location-marker"
        aria-hidden="true"
      ></div>
    `,

    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function locateUser() {
  if (!communityMap) {
    return;
  }

  closePointDetails();

  showMapStatus("Buscando sua localização...", 10000);

  communityMap.locate({
    setView: true,
    maxZoom: 16,
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 300000,
  });
}

function handleLocationFound(event) {
  if (!communityMap) {
    return;
  }

  if (userLocationMarker) {
    communityMap.removeLayer(userLocationMarker);
  }

  if (userAccuracyCircle) {
    communityMap.removeLayer(userAccuracyCircle);
  }

  userLocationMarker = L.marker(event.latlng, {
    icon: createUserLocationIcon(),

    title: "Sua localização",

    zIndexOffset: 1000,
  }).addTo(communityMap);

  userAccuracyCircle = L.circle(event.latlng, {
    radius: event.accuracy,
    color: "#4285F4",
    fillColor: "#4285F4",
    fillOpacity: 0.12,
    weight: 1.5,
  }).addTo(communityMap);

  showMapStatus("Localização encontrada.");
}

function handleLocationError(error) {
  console.error("[Mapa] Não foi possível localizar o usuário:", error);

  const messages = {
    1: "Permissão de localização negada.",

    2: "Não foi possível determinar sua localização.",

    3: "A busca pela localização demorou demais.",
  };

  showMapStatus(
    messages[error?.code] || "Não foi possível acessar sua localização.",

    5000,
  );
}

/* ==============================
   INTERFACE
================================ */

function initializeInterfaceEvents() {
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.mapFilter;

      if (!filter) {
        return;
      }

      showMapFilter(filter);
    });
  });

  locateUserButton?.addEventListener("click", locateUser);

  bottomSheetCloseButton?.addEventListener("click", closePointDetails);
  inviteToPlayButton?.addEventListener("click", openInvitePanel);

  inviteCloseButton?.addEventListener("click", closeInvitePanel);

  inviteCancelButton?.addEventListener("click", closeInvitePanel);

  inviteOverlay?.addEventListener("click", closeInvitePanel);
  inviteModalityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectInviteModality(button);
    });
  });

  inviteMessageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectInviteMessage(button);
    });
  });

  inviteSendButton?.addEventListener("click", sendInvite);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (inviteLayer && !inviteLayer.hidden) {
      closeInvitePanel();
      return;
    }

    if (bottomSheet?.classList.contains("is-open")) {
      closePointDetails();
    }
  });
}

/* ==============================
   INICIALIZAR LEAFLET
================================ */

function initializeLeafletMap() {
  if (!mapElement) {
    throw new Error("O elemento #community-map não foi encontrado.");
  }

  if (typeof L === "undefined") {
    throw new Error("A biblioteca Leaflet não foi carregada.");
  }

  communityMap = L.map(mapElement, {
    zoomControl: false,
    attributionControl: true,
  }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

  L.tileLayer(MAP_TILE_URL, {
    maxZoom: 19,
    attribution: MAP_ATTRIBUTION,
  }).addTo(communityMap);

  L.control
    .zoom({
      position: "bottomright",
    })
    .addTo(communityMap);

  mapLayers.player = L.layerGroup();

  mapLayers.store = L.layerGroup();

  mapLayers.event = L.layerGroup();

  communityMap.on("locationfound", handleLocationFound);

  communityMap.on("locationerror", handleLocationError);

  window.requestAnimationFrame(() => {
    communityMap.invalidateSize();
  });
}

/* ==============================
   CARREGAR PONTOS
================================ */

async function loadMapPoints() {
  showMapStatus("Carregando comunidade...", 0);

  let publicPlayers = [];
  let activeEvents = [];

  try {
    publicPlayers = await loadPublicPlayers();
  } catch (error) {
    console.error(
      "[Mapa] Não foi possível carregar os perfis públicos:",
      error,
    );
  }

  try {
    activeEvents = await loadActiveEvents();
  } catch (error) {
    console.error("[Mapa] Não foi possível carregar os eventos:", error);
  }

  allMapPoints = [...publicPlayers, ...activeEvents, ...temporaryMapPoints];

  allMapPoints.forEach(addPointToMap);

  showMapFilter("all");

  fitMapToPoints(allMapPoints);

  const playerText = `${publicPlayers.length} jogador${
    publicPlayers.length === 1 ? "" : "es"
  }`;

  const eventText = `${activeEvents.length} evento${
    activeEvents.length === 1 ? "" : "s"
  }`;

  showMapStatus(`${playerText} e ${eventText} encontrados.`, 5000);
}

/* ==============================
   INICIALIZAÇÃO
================================ */

async function initializeMapPage() {
  try {
    const authenticatedUser = await authReady;

    currentUserId = authenticatedUser?.uid || auth.currentUser?.uid || "";

    initializeLeafletMap();

    initializeInterfaceEvents();

    await loadMapPoints();
  } catch (error) {
    console.error("[Mapa] Falha na inicialização:", error);

    showMapStatus("Não foi possível inicializar o mapa.", 0);
  }
}

initializeMapPage();
