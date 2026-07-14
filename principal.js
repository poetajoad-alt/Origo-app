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
   BANNERS LOCAIS
================================ */

const banners = [
  {
    image: "assets/banner-1.jpg",
    link: "#",
    alt: "Destaque principal da comunidade Origo",
  },
  {
    image: "assets/banner-2.jpg",
    link: "#",
    alt: "Segundo destaque da comunidade Origo",
  },
  {
    image: "assets/banner-3.jpg",
    link: "#",
    alt: "Terceiro destaque da comunidade Origo",
  },
  {
    image: "assets/banner-4.jpg",
    link: "#",
    alt: "Quarto destaque da comunidade Origo",
  },
  {
    image: "assets/banner-5.jpg",
    link: "#",
    alt: "Quinto destaque da comunidade Origo",
  },
];

/* ==============================
   ELEMENTOS DA PÁGINA
================================ */

const carousel = document.getElementById("banner-carousel");

const bannerLink = document.getElementById("banner-link");

const bannerImage = document.getElementById("banner-image");

const indicatorsContainer = document.getElementById("banner-indicators");

const menuButton = document.getElementById("open-menu-button");

const searchButton = document.getElementById("open-search-button");

const sideMenuLayer = document.getElementById("side-menu-layer");

const sideMenu = document.getElementById("side-menu");

const sideMenuOverlay = document.getElementById("side-menu-overlay");

const closeMenuButton = document.getElementById("close-menu-button");

const comingSoonLinks = document.querySelectorAll("[data-coming-soon='true']");

const sideMenuNavigationLinks = document.querySelectorAll(
  ".side-menu-link:not([data-coming-soon='true'])",
);

const eventsTrack = document.getElementById("events-track");

const eventsPreferReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

let lastFocusedElement = null;

/* ==============================
   CONFIGURAÇÕES DO CARROSSEL
================================ */

const AUTO_PLAY_INTERVAL = 6000;
const SWIPE_MIN_DISTANCE = 45;

let currentBannerIndex = 0;
let autoPlayTimer = null;

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

/* ==============================
   INDICADORES DOS BANNERS
================================ */

function createIndicators() {
  if (!indicatorsContainer) {
    return;
  }

  indicatorsContainer.innerHTML = "";

  banners.forEach((banner, index) => {
    const indicator = document.createElement("button");

    indicator.type = "button";
    indicator.className = "banner-indicator";

    indicator.setAttribute("aria-label", `Exibir banner ${index + 1}`);

    indicator.addEventListener("click", () => {
      showBanner(index);
      restartAutoPlay();
    });

    indicatorsContainer.appendChild(indicator);
  });
}

/* ==============================
   EXIBIÇÃO DOS BANNERS
================================ */

function showBanner(index) {
  if (!banners.length || !bannerImage || !bannerLink) {
    return;
  }

  currentBannerIndex = (index + banners.length) % banners.length;

  const selectedBanner = banners[currentBannerIndex];

  bannerImage.classList.add("is-changing");

  window.setTimeout(() => {
    bannerImage.src = selectedBanner.image;
    bannerImage.alt = selectedBanner.alt;
    bannerLink.href = selectedBanner.link || "#";

    updateIndicators();

    bannerImage.classList.remove("is-changing");
  }, 160);
}

/* ==============================
   ATUALIZAÇÃO DOS INDICADORES
================================ */

function updateIndicators() {
  if (!indicatorsContainer) {
    return;
  }

  const indicators = indicatorsContainer.querySelectorAll(".banner-indicator");

  indicators.forEach((indicator, index) => {
    const isActive = index === currentBannerIndex;

    indicator.classList.toggle("is-active", isActive);

    if (isActive) {
      indicator.setAttribute("aria-current", "true");

      return;
    }

    indicator.removeAttribute("aria-current");
  });
}

/* ==============================
   NAVEGAÇÃO DO BANNER
================================ */

function showNextBanner() {
  showBanner(currentBannerIndex + 1);
}

function showPreviousBanner() {
  showBanner(currentBannerIndex - 1);
}

/* ==============================
   TROCA AUTOMÁTICA DO BANNER
================================ */

function startAutoPlay() {
  stopAutoPlay();

  if (banners.length <= 1) {
    return;
  }

  autoPlayTimer = window.setInterval(showNextBanner, AUTO_PLAY_INTERVAL);
}

function stopAutoPlay() {
  if (!autoPlayTimer) {
    return;
  }

  window.clearInterval(autoPlayTimer);
  autoPlayTimer = null;
}

function restartAutoPlay() {
  stopAutoPlay();
  startAutoPlay();
}

/* ==============================
   GESTO LATERAL NO CELULAR
================================ */

carousel?.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.changedTouches[0];

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    stopAutoPlay();
  },
  {
    passive: true,
  },
);

carousel?.addEventListener(
  "touchend",
  (event) => {
    const touch = event.changedTouches[0];

    touchEndX = touch.clientX;
    touchEndY = touch.clientY;

    handleSwipe();
    startAutoPlay();
  },
  {
    passive: true,
  },
);

function handleSwipe() {
  const horizontalDistance = touchEndX - touchStartX;

  const verticalDistance = touchEndY - touchStartY;

  const isHorizontalGesture =
    Math.abs(horizontalDistance) > Math.abs(verticalDistance);

  const reachedMinimumDistance =
    Math.abs(horizontalDistance) >= SWIPE_MIN_DISTANCE;

  if (!isHorizontalGesture || !reachedMinimumDistance) {
    return;
  }

  if (horizontalDistance < 0) {
    showNextBanner();
    return;
  }

  showPreviousBanner();
}

/* ==============================
   CONTROLE POR TECLADO
================================ */

carousel?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    showNextBanner();
    restartAutoPlay();
  }

  if (event.key === "ArrowLeft") {
    showPreviousBanner();
    restartAutoPlay();
  }
});

/* ==============================
   LINK DO BANNER
================================ */

bannerLink?.addEventListener("click", (event) => {
  const selectedBanner = banners[currentBannerIndex];

  if (!selectedBanner.link || selectedBanner.link === "#") {
    event.preventDefault();
  }
});

/* ==============================
   IMAGEM RESERVA
================================ */

bannerImage?.addEventListener("error", () => {
  const fallbackImage = "assets/banner-1.jpg";

  if (!bannerImage.src.endsWith("banner-1.jpg")) {
    bannerImage.src = fallbackImage;
  }
});

/* ==============================
   MENU LATERAL
================================ */

function getMenuFocusableElements() {
  if (!sideMenu) {
    return [];
  }

  return Array.from(
    sideMenu.querySelectorAll(
      `
        a[href],
        button:not([disabled]),
        input:not([disabled]),
        select:not([disabled]),
        textarea:not([disabled]),
        [tabindex]:not([tabindex="-1"])
      `,
    ),
  ).filter((element) => {
    return !element.hasAttribute("hidden");
  });
}

function openSideMenu() {
  if (!sideMenuLayer || !menuButton) {
    return;
  }

  lastFocusedElement = document.activeElement;

  sideMenuLayer.classList.add("is-open");

  sideMenuLayer.setAttribute("aria-hidden", "false");

  menuButton.setAttribute("aria-expanded", "true");

  document.body.classList.add("menu-open");

  window.setTimeout(() => {
    closeMenuButton?.focus();
  }, 180);
}

function closeSideMenu({ restoreFocus = true } = {}) {
  if (!sideMenuLayer || !menuButton) {
    return;
  }

  if (restoreFocus && lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }

  sideMenuLayer.classList.remove("is-open");

  sideMenuLayer.setAttribute("aria-hidden", "true");

  menuButton.setAttribute("aria-expanded", "false");

  document.body.classList.remove("menu-open");
}

function isSideMenuOpen() {
  return sideMenuLayer?.classList.contains("is-open");
}

function trapMenuFocus(event) {
  if (event.key !== "Tab" || !isSideMenuOpen()) {
    return;
  }

  const focusableElements = getMenuFocusableElements();

  if (!focusableElements.length) {
    event.preventDefault();
    return;
  }

  const firstElement = focusableElements[0];

  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

menuButton?.addEventListener("click", openSideMenu);

closeMenuButton?.addEventListener("click", () => {
  closeSideMenu();
});

sideMenuOverlay?.addEventListener("click", () => {
  closeSideMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isSideMenuOpen()) {
    closeSideMenu();
    return;
  }

  trapMenuFocus(event);
});

sideMenuNavigationLinks.forEach((link) => {
  link.addEventListener("click", () => {
    closeSideMenu({
      restoreFocus: false,
    });
  });
});

/* ==============================
   PÁGINAS EM DESENVOLVIMENTO
================================ */

comingSoonLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const pageName =
      link.querySelector("span")?.textContent?.trim() || "Esta área";

    window.alert(`${pageName} será adicionada nas próximas etapas do projeto.`);
  });
});

/* ==============================
   ACESSAR EVENTOS PELO MENU
================================ */

const sideMenuEventsLink = document.getElementById("side-menu-events-link");

sideMenuEventsLink?.addEventListener("click", (event) => {
  event.preventDefault();

  closeSideMenu({
    restoreFocus: false,
  });

  window.setTimeout(() => {
    const eventsTitle = document.getElementById("events-title");

    if (!eventsTitle) {
      return;
    }

    const headerHeight =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--header-height",
        ),
      ) || 72;

    const targetPosition =
      eventsTitle.getBoundingClientRect().top +
      window.scrollY -
      headerHeight -
      16;

    window.scrollTo({
      top: Math.max(0, targetPosition),

      behavior: eventsPreferReducedMotion ? "auto" : "smooth",
    });
  }, 320);
});

/* ==============================
   PESQUISA
================================ */

searchButton?.addEventListener("click", () => {
  console.log("Abrir pesquisa");
});

/* ==============================
   CONTROLE DA ABA
================================ */

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAutoPlay();
    return;
  }

  startAutoPlay();
});

/* ==============================
   INICIALIZAÇÃO DOS BANNERS
================================ */

function initializeCarousel() {
  if (!carousel) {
    return;
  }

  if (!banners.length) {
    carousel.hidden = true;
    return;
  }

  createIndicators();
  showBanner(0);
  startAutoPlay();
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
   DATAS DOS EVENTOS
================================ */

function createEventDate(dateValue, timeValue) {
  let eventDate = null;

  if (
    dateValue &&
    typeof dateValue === "object" &&
    typeof dateValue.toDate === "function"
  ) {
    eventDate = dateValue.toDate();
  }

  if (!eventDate && typeof dateValue === "string") {
    const normalizedDate = dateValue.includes("T")
      ? dateValue
      : `${dateValue}T12:00:00`;

    eventDate = new Date(normalizedDate);
  }

  if (!eventDate || Number.isNaN(eventDate.getTime())) {
    return null;
  }

  const timeMatch = String(timeValue || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);

  if (timeMatch) {
    eventDate.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
  }

  return eventDate;
}

function capitalizeFirstLetter(value) {
  const text = String(value || "");

  if (!text) {
    return "";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatEventSummaryDate(eventDate, time) {
  if (!eventDate) {
    return time ? `Data a definir, ${time}` : "Data a definir";
  }

  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(eventDate);

  const dateText = capitalizeFirstLetter(formattedDate);

  return time ? `${dateText}, ${time}` : dateText;
}

function formatEventDetailDate(eventDate) {
  if (!eventDate) {
    return "Data a definir";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(eventDate);
}

function formatEventTime(time) {
  const normalizedTime = String(time || "").trim();

  const match = normalizedTime.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return normalizedTime || "Horário a definir";
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return minutes === 0
    ? `${hours}h`
    : `${hours}h${String(minutes).padStart(2, "0")}`;
}

function createDateTimeAttribute(eventDate) {
  if (!eventDate) {
    return "";
  }

  const year = eventDate.getFullYear();

  const month = String(eventDate.getMonth() + 1).padStart(2, "0");

  const day = String(eventDate.getDate()).padStart(2, "0");

  const hours = String(eventDate.getHours()).padStart(2, "0");

  const minutes = String(eventDate.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}` + `T${hours}:${minutes}`;
}

/* ==============================
   CONVERTER EVENTO DO FIREBASE
================================ */

function normalizeEventDocument(documentSnapshot) {
  const data = documentSnapshot.data();

  const title = typeof data.titulo === "string" ? data.titulo.trim() : "";

  if (data.ativo !== true || !title) {
    return null;
  }

  const timestampStartDate =
    typeof data.dataHoraInicio?.toDate === "function"
      ? data.dataHoraInicio.toDate()
      : null;

  const legacyStartDate = createEventDate(data.data, data.horario);

  const eventDate = timestampStartDate || legacyStartDate;

  const category =
    typeof data.categoria === "string" ? data.categoria.trim() : "";

  const image = typeof data.imagem === "string" ? data.imagem.trim() : "";

  const location = typeof data.local === "string" ? data.local.trim() : "";

  const city = typeof data.cidade === "string" ? data.cidade.trim() : "";

  const description =
    typeof data.descricao === "string" ? data.descricao.trim() : "";

  const format = typeof data.formato === "string" ? data.formato.trim() : "";

  const legacyTime =
    typeof data.horario === "string" ? data.horario.trim() : "";

  const time = eventDate
    ? `${String(eventDate.getHours()).padStart(2, "0")}:${String(
        eventDate.getMinutes(),
      ).padStart(2, "0")}`
    : legacyTime;

  return {
    id: documentSnapshot.id,

    title,

    category: category || "Evento",

    image: image || "assets/banner-1.jpg",

    location: location || city || "Local a definir",

    city,

    time,

    description:
      description || "Confira os detalhes deste evento da comunidade Origo.",

    format: format || category || "Evento presencial",

    eventDate,

    sortDate: eventDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
  };
}

/* ==============================
   LINHAS DOS DETALHES
================================ */

function createEventDetailRow(label, value) {
  if (!String(value || "").trim()) {
    return "";
  }

  return `
    <div class="event-detail-row">
      <strong>
        ${escapeHTML(label)}
      </strong>

      <span>
        ${escapeHTML(value)}
      </span>
    </div>
  `;
}

/* ==============================
   CRIAÇÃO DOS CARDS
================================ */

function createEventCardHTML(event, index) {
  const detailsId = `event-details-${index + 1}`;

  const summaryDate = formatEventSummaryDate(event.eventDate, event.time);

  const detailDate = formatEventDetailDate(event.eventDate);

  const detailTime = formatEventTime(event.time);

  const dateTimeAttribute = createDateTimeAttribute(event.eventDate);

  const cityRow =
    event.city && event.city !== event.location
      ? createEventDetailRow("Cidade", event.city)
      : "";

  return `
    <article
      class="event-card"
      data-event-id="${escapeHTML(event.id)}"
    >
      <button
        class="event-card-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="${detailsId}"
      >
        <div class="event-card-image-wrapper">

          <img
            class="event-card-image"
            src="${escapeHTML(event.image)}"
            alt="${escapeHTML(event.title)}"
          >

          <span class="event-card-category">
            ${escapeHTML(event.category)}
          </span>

        </div>

        <div class="event-card-summary">

          <h3 class="event-card-title">
            ${escapeHTML(event.title)}
          </h3>

          <div class="event-card-location">

            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 22C12 22 20 15.5 20 9A8 8 0 1 0 4 9C4 15.5 12 22 12 22Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <circle
                cx="12"
                cy="9"
                r="2.5"
                stroke="currentColor"
                stroke-width="2"
              />
            </svg>

            <div>
              <p>
                ${escapeHTML(event.location)}
              </p>

              <time
                ${dateTimeAttribute ? `datetime="${dateTimeAttribute}"` : ""}
              >
                ${escapeHTML(summaryDate)}
              </time>
            </div>

          </div>

          <span class="event-expand-label">

            <span class="event-expand-text">
              Ver detalhes
            </span>

            <svg
              class="event-expand-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 9L12 15L18 9"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>

          </span>

        </div>
      </button>

      <div
        class="event-details-panel"
        id="${detailsId}"
        aria-hidden="true"
      >
        ${createEventDetailRow("Data", detailDate)}

        ${createEventDetailRow("Horário", detailTime)}

        ${createEventDetailRow("Local", event.location)}

        ${cityRow}

        ${createEventDetailRow("Formato", event.format)}

        <p class="event-description">
          ${escapeHTML(event.description)}
        </p>

      </div>
    </article>
  `;
}

/* ==============================
   CENTRALIZAR CARD
================================ */

function centerEventCard(card) {
  if (!eventsTrack || !card) {
    return;
  }

  const targetPosition =
    card.offsetLeft - (eventsTrack.clientWidth - card.offsetWidth) / 2;

  eventsTrack.scrollTo({
    left: Math.max(0, targetPosition),

    behavior: eventsPreferReducedMotion ? "auto" : "smooth",
  });
}

/* ==============================
   FECHAR CARD
================================ */

function closeEventCard(card) {
  if (!card) {
    return;
  }

  const toggle = card.querySelector(".event-card-toggle");

  const details = card.querySelector(".event-details-panel");

  const label = card.querySelector(".event-expand-text");

  card.classList.remove("is-expanded");

  toggle?.setAttribute("aria-expanded", "false");

  details?.setAttribute("aria-hidden", "true");

  if (label) {
    label.textContent = "Ver detalhes";
  }
}

/* ==============================
   ABRIR CARD
================================ */

function openEventCard(card) {
  if (!card) {
    return;
  }

  const toggle = card.querySelector(".event-card-toggle");

  const details = card.querySelector(".event-details-panel");

  const label = card.querySelector(".event-expand-text");

  card.classList.add("is-expanded");

  toggle?.setAttribute("aria-expanded", "true");

  details?.setAttribute("aria-hidden", "false");

  if (label) {
    label.textContent = "Ocultar detalhes";
  }

  window.setTimeout(() => {
    centerEventCard(card);
  }, 80);
}

/* ==============================
   EVENTOS DOS CARDS
================================ */

function initializeEventCards() {
  if (!eventsTrack) {
    return;
  }

  const eventCards = eventsTrack.querySelectorAll(".event-card");

  eventCards.forEach((card) => {
    const toggle = card.querySelector(".event-card-toggle");

    toggle?.addEventListener("click", () => {
      const cardIsExpanded = card.classList.contains("is-expanded");

      eventCards.forEach((otherCard) => {
        closeEventCard(otherCard);
      });

      if (cardIsExpanded) {
        return;
      }

      openEventCard(card);
    });
  });

  const eventImages = eventsTrack.querySelectorAll(".event-card-image");

  eventImages.forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        if (!image.src.endsWith("banner-1.jpg")) {
          image.src = "assets/banner-1.jpg";
        }
      },
      {
        once: true,
      },
    );
  });
}

/* ==============================
   CARREGAR EVENTOS
================================ */

async function loadEvents() {
  if (!eventsTrack) {
    return;
  }

  eventsTrack.innerHTML = `
    <p class="events-loading">
      Carregando eventos...
    </p>
  `;

  try {
    await authReady;

    const eventsQuery = query(
      collection(db, "eventos"),

      where("ativo", "==", true),
    );

    const snapshot = await getDocs(eventsQuery);

    const events = snapshot.docs
      .map(normalizeEventDocument)
      .filter(Boolean)
      .sort((first, second) => {
        return first.sortDate - second.sortDate;
      });

    if (!events.length) {
      eventsTrack.innerHTML = `
        <p class="events-loading">
          Nenhum evento disponível no momento.
        </p>
      `;

      return;
    }

    eventsTrack.innerHTML = events.map(createEventCardHTML).join("");

    initializeEventCards();

    console.log(
      `[Eventos] ${events.length} evento(s) carregado(s) do Firebase.`,
    );
  } catch (error) {
    console.error("[Eventos] Não foi possível carregar os eventos:", error);

    eventsTrack.innerHTML = `
      <p class="events-loading">
        Não foi possível carregar os eventos.
      </p>
    `;
  }
}

/* ==============================
   PRÉVIA DO MAPA
================================ */

const MAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">' +
  "OpenStreetMap</a> contributors";

const HOME_MAP_CENTER = [-23.455, -46.535];

const communityMapPoints = [
  {
    type: "player",
    name: "Jogador disponível",
    latitude: -23.4525,
    longitude: -46.5305,
    available: true,
  },
  {
    type: "player",
    name: "Jogador próximo",
    latitude: -23.4585,
    longitude: -46.538,
    available: false,
  },
  {
    type: "store",
    name: "Loja parceira",
    latitude: -23.454,
    longitude: -46.542,
    available: false,
  },
  {
    type: "event",
    name: "Evento de TCG",
    latitude: -23.4605,
    longitude: -46.5315,
    available: false,
  },
];

function getMarkerConfiguration(type) {
  const markerConfigurations = {
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
          d="M14 35C15 28 18.8 24 24 24C29.2 24 33 28 34 35Z"
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

  return markerConfigurations[type] || markerConfigurations.player;
}

function createCommunityMarkerIcon(type, isAvailable = false) {
  const configuration = getMarkerConfiguration(type);

  const statusElement = isAvailable
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

        ${statusElement}
      </div>
    `,

    iconSize: [48, 58],
    iconAnchor: [24, 56],
  });
}

function initializeMapPreview() {
  const mapElement = document.getElementById("community-map-preview");

  if (!mapElement) {
    return;
  }

  if (typeof L === "undefined") {
    console.error("A biblioteca Leaflet não foi carregada.");

    return;
  }

  const previewMap = L.map(mapElement, {
    zoomControl: false,

    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,

    attributionControl: true,
  });

  previewMap.setView(HOME_MAP_CENTER, 14);

  L.tileLayer(MAP_TILE_URL, {
    maxZoom: 19,
    attribution: MAP_ATTRIBUTION,
  }).addTo(previewMap);

  communityMapPoints.forEach((point) => {
    const markerIcon = createCommunityMarkerIcon(point.type, point.available);

    L.marker([point.latitude, point.longitude], {
      icon: markerIcon,
      interactive: false,
      keyboard: false,
    }).addTo(previewMap);
  });

  window.requestAnimationFrame(() => {
    previewMap.invalidateSize();
  });
}

/* ==============================
   INICIALIZAÇÃO
================================ */

async function initializePrincipalPage() {
  initializeCarousel();

  await loadEvents();

  initializeMapPreview();
}

initializePrincipalPage();
