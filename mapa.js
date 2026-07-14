"use strict";

/* ==============================
   FIREBASE
================================ */

import { db } from "./firebase-config.js";
import { authReady } from "./auth-guard.js";

import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

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

/* ==============================
   ESTADO
================================ */

let communityMap = null;
let currentFilter = "all";

let userLocationMarker = null;
let userAccuracyCircle = null;

let statusTimer = null;

let allMapPoints = [];

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
  bottomSheet?.classList.remove("is-open");

  bottomSheet?.setAttribute("aria-hidden", "true");

  mapPage?.classList.remove("sheet-open");
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && bottomSheet?.classList.contains("is-open")) {
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
    await authReady;

    initializeLeafletMap();

    initializeInterfaceEvents();

    await loadMapPoints();
  } catch (error) {
    console.error("[Mapa] Falha na inicialização:", error);

    showMapStatus("Não foi possível inicializar o mapa.", 0);
  }
}

initializeMapPage();
