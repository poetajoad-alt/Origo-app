"use strict";

import { db } from "./firebase-config.js";

import { authReady } from "./auth-guard.js";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* ==============================
   ELEMENTOS
================================ */

const adminAccessLoading = document.getElementById("admin-access-loading");

const adminPage = document.getElementById("admin-page");

const form = document.getElementById("admin-event-form");

const formTitle = document.getElementById("admin-form-title");

const eventIdInput = document.getElementById("event-id");

const eventTitleInput = document.getElementById("event-title");

const eventCategoryInput = document.getElementById("event-category");

const eventFormatInput = document.getElementById("event-format");

const eventImageInput = document.getElementById("event-image");

const eventImagePreview = document.getElementById("event-image-preview");

const eventImagePreviewMessage = document.getElementById(
  "event-image-preview-message",
);

const eventStartInput = document.getElementById("event-start");

const eventEndInput = document.getElementById("event-end");

const eventLocationInput = document.getElementById("event-location");

const eventCityInput = document.getElementById("event-city");

const eventLatitudeInput = document.getElementById("event-latitude");

const eventLongitudeInput = document.getElementById("event-longitude");

const eventDescriptionInput = document.getElementById("event-description");

const descriptionCharacterCount = document.getElementById(
  "description-character-count",
);

const eventActiveInput = document.getElementById("event-active");

const formMessage = document.getElementById("admin-form-message");

const saveButton = document.getElementById("save-event-button");

const cancelEditButton = document.getElementById("cancel-edit-button");

const newEventButton = document.getElementById("new-event-button");

const refreshEventsButton = document.getElementById("refresh-events-button");

const eventsList = document.getElementById("admin-events-list");

const filterButtons = document.querySelectorAll("[data-event-filter]");

/* ==============================
   ESTADO
================================ */

let currentAdminUser = null;
let allEvents = [];
let currentFilter = "all";
let formIsSaving = false;

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
   MENSAGENS
================================ */

function showFormMessage(message, type = "error") {
  if (!formMessage) {
    return;
  }

  formMessage.textContent = message;

  formMessage.hidden = false;

  formMessage.classList.remove("is-success", "is-error");

  formMessage.classList.add(type === "success" ? "is-success" : "is-error");
}

function clearFormMessage() {
  if (!formMessage) {
    return;
  }

  formMessage.textContent = "";
  formMessage.hidden = true;

  formMessage.classList.remove("is-success", "is-error");
}

/* ==============================
   CAMINHO DA IMAGEM
================================ */

function normalizeImagePath(value) {
  let imageName = String(value || "")
    .trim()
    .replaceAll("\\", "/");

  imageName = imageName.replace(/^\.?\/*assets\//i, "");

  if (
    imageName.includes("../") ||
    imageName.includes("://") ||
    imageName.includes("/")
  ) {
    return null;
  }

  const validImagePattern = /^evento-\d+\.(jpg|jpeg|png|webp|avif)$/i;

  if (!validImagePattern.test(imageName)) {
    return null;
  }

  return `assets/${imageName}`;
}

function getImageInputValue(path) {
  return String(path || "").replace(/^assets\//i, "");
}

function updateImagePreview() {
  const normalizedPath = normalizeImagePath(eventImageInput?.value);

  if (!eventImagePreview || !eventImagePreviewMessage) {
    return;
  }

  if (!normalizedPath) {
    eventImagePreview.hidden = true;
    eventImagePreviewMessage.hidden = false;

    eventImagePreviewMessage.textContent =
      "Use um nome como evento-1.jpg ou evento-1000.webp.";

    return;
  }

  eventImagePreviewMessage.hidden = true;

  eventImagePreview.hidden = false;
  eventImagePreview.src = normalizedPath;
}

eventImagePreview?.addEventListener("load", () => {
  eventImagePreview.hidden = false;

  if (eventImagePreviewMessage) {
    eventImagePreviewMessage.hidden = true;
  }
});

eventImagePreview?.addEventListener("error", () => {
  eventImagePreview.hidden = true;

  if (eventImagePreviewMessage) {
    eventImagePreviewMessage.hidden = false;

    eventImagePreviewMessage.textContent =
      "Imagem não encontrada na pasta assets.";
  }
});

/* ==============================
   DATA E HORA
================================ */

function parseLocalDateTime(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return null;
  }

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function timestampToInputValue(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") {
    return "";
  }

  const date = timestamp.toDate();

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  const hours = String(date.getHours()).padStart(2, "0");

  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}` + `T${hours}:${minutes}`;
}

function formatDateTime(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") {
    return "Data não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp.toDate());
}

/* ==============================
   STATUS DO EVENTO
================================ */

function getEventStatus(event) {
  const now = new Date();

  const endDate = event.dataHoraFim?.toDate?.();

  if (endDate && endDate < now) {
    return "finished";
  }

  if (event.ativo !== true) {
    return "inactive";
  }

  return "active";
}

function getEventStatusLabel(status) {
  const labels = {
    active: "Ativo",
    inactive: "Inativo",
    finished: "Finalizado",
  };

  return labels[status] || "Evento";
}

/* ==============================
   VERIFICAR ADMINISTRADOR
================================ */

async function verifyAdminAccess() {
  try {
    currentAdminUser = await authReady;

    const adminReference = doc(db, "admins", currentAdminUser.uid);

    const adminSnapshot = await getDoc(adminReference);

    const adminIsActive =
      adminSnapshot.exists() && adminSnapshot.data().ativo === true;

    if (!adminIsActive) {
      window.alert("Sua conta não possui acesso administrativo.");

      window.location.replace("principal.html");

      return false;
    }

    adminAccessLoading.hidden = true;
    adminPage.hidden = false;

    return true;
  } catch (error) {
    console.error("[Admin] Erro ao verificar administrador:", error);

    window.alert("Não foi possível verificar o acesso administrativo.");

    window.location.replace("principal.html");

    return false;
  }
}

/* ==============================
   ESTADO DO FORMULÁRIO
================================ */

function setFormSaving(isSaving) {
  formIsSaving = isSaving;

  if (saveButton) {
    saveButton.disabled = isSaving;

    saveButton.textContent = isSaving
      ? "Salvando..."
      : eventIdInput.value
        ? "Atualizar evento"
        : "Salvar evento";
  }
}

function resetForm() {
  form?.reset();

  eventIdInput.value = "";

  eventActiveInput.checked = true;

  formTitle.textContent = "Novo evento";

  saveButton.textContent = "Salvar evento";

  cancelEditButton.hidden = true;

  eventImageInput.value = "evento-1.jpg";

  eventImagePreview.src = "assets/evento-1.jpg";

  eventImagePreview.hidden = false;
  eventImagePreviewMessage.hidden = true;

  descriptionCharacterCount.textContent = "0";

  clearFormMessage();
}

function focusForm() {
  document.getElementById("admin-form-section")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  window.setTimeout(() => {
    eventTitleInput?.focus();
  }, 400);
}

/* ==============================
   VALIDAR FORMULÁRIO
================================ */

function getValidatedFormData() {
  const title = eventTitleInput.value.trim();

  const category = eventCategoryInput.value.trim();

  const format = eventFormatInput.value.trim();

  const image = normalizeImagePath(eventImageInput.value);

  const startDate = parseLocalDateTime(eventStartInput.value);

  const endDate = parseLocalDateTime(eventEndInput.value);

  const location = eventLocationInput.value.trim();

  const city = eventCityInput.value.trim();

  const latitude = Number(eventLatitudeInput.value);

  const longitude = Number(eventLongitudeInput.value);

  const description = eventDescriptionInput.value.trim();

  if (title.length < 2) {
    showFormMessage("Digite o título do evento.");

    eventTitleInput.focus();
    return null;
  }

  if (!category) {
    showFormMessage("Selecione a categoria.");

    eventCategoryInput.focus();
    return null;
  }

  if (format.length < 2) {
    showFormMessage("Informe o formato do evento.");

    eventFormatInput.focus();
    return null;
  }

  if (!image) {
    showFormMessage("Use uma imagem válida, como evento-1.jpg.");

    eventImageInput.focus();
    return null;
  }

  if (!startDate || !endDate) {
    showFormMessage("Informe as datas de início e término.");

    eventStartInput.focus();
    return null;
  }

  if (endDate <= startDate) {
    showFormMessage("O término precisa ser posterior ao início.");

    eventEndInput.focus();
    return null;
  }

  if (location.length < 2) {
    showFormMessage("Informe o local do evento.");

    eventLocationInput.focus();
    return null;
  }

  if (city.length < 2) {
    showFormMessage("Informe a cidade.");

    eventCityInput.focus();
    return null;
  }

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    showFormMessage("Informe uma latitude válida.");

    eventLatitudeInput.focus();
    return null;
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    showFormMessage("Informe uma longitude válida.");

    eventLongitudeInput.focus();
    return null;
  }

  if (description.length < 2) {
    showFormMessage("Digite uma descrição para o evento.");

    eventDescriptionInput.focus();
    return null;
  }

  return {
    titulo: title,
    categoria: category,
    imagem: image,
    local: location,
    cidade: city,
    descricao: description,
    formato: format,
    latitude,
    longitude,
    dataHoraInicio: Timestamp.fromDate(startDate),
    dataHoraFim: Timestamp.fromDate(endDate),
    ativo: eventActiveInput.checked,
  };
}

/* ==============================
   SALVAR EVENTO
================================ */

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (formIsSaving) {
    return;
  }

  clearFormMessage();

  const eventData = getValidatedFormData();

  if (!eventData) {
    return;
  }

  setFormSaving(true);

  try {
    const eventId = eventIdInput.value.trim();

    if (eventId) {
      await updateDoc(doc(db, "eventos", eventId), {
        ...eventData,
        atualizadoEm: serverTimestamp(),
      });

      showFormMessage("Evento atualizado com sucesso!", "success");
    } else {
      await addDoc(collection(db, "eventos"), {
        ...eventData,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });

      showFormMessage("Evento criado com sucesso!", "success");
    }

    await loadEvents();

    window.setTimeout(() => {
      resetForm();
    }, 1100);
  } catch (error) {
    console.error("[Admin] Erro ao salvar evento:", error);

    showFormMessage(
      error?.code === "permission-denied"
        ? "O Firebase bloqueou a operação. Confira a conta administrativa e as regras."
        : "Não foi possível salvar o evento.",
    );
  } finally {
    setFormSaving(false);
  }
});

/* ==============================
   CRIAR CARD DO PAINEL
================================ */

function createAdminEventCard(event) {
  const status = getEventStatus(event);

  return `
    <article
      class="admin-event-card"
      data-event-id="${escapeHTML(event.id)}"
    >
      <div class="admin-event-card-image">
        <img
          src="${escapeHTML(event.imagem)}"
          alt="${escapeHTML(event.titulo)}"
        >

        <span
          class="
            admin-event-status
            ${status === "inactive" ? "is-inactive" : ""}
            ${status === "finished" ? "is-finished" : ""}
          "
        >
          ${getEventStatusLabel(status)}
        </span>
      </div>

      <div class="admin-event-card-content">
        <span class="admin-event-category">
          ${escapeHTML(event.categoria)}
        </span>

        <h3>
          ${escapeHTML(event.titulo)}
        </h3>

        <div class="admin-event-meta">
          <p>
            <strong>Início:</strong>
            ${escapeHTML(formatDateTime(event.dataHoraInicio))}
          </p>

          <p>
            <strong>Término:</strong>
            ${escapeHTML(formatDateTime(event.dataHoraFim))}
          </p>

          <p>
            <strong>Local:</strong>
            ${escapeHTML(event.local)}
          </p>
        </div>

        <div class="admin-event-card-actions">
          <button
            class="admin-event-action"
            type="button"
            data-event-action="edit"
          >
            Editar
          </button>

          <button
            class="admin-event-action is-status"
            type="button"
            data-event-action="status"
          >
            ${event.ativo ? "Desativar" : "Ativar"}
          </button>

          <button
            class="admin-event-action is-delete"
            type="button"
            data-event-action="delete"
          >
            Excluir
          </button>
        </div>
      </div>
    </article>
  `;
}

/* ==============================
   FILTRAR EVENTOS
================================ */

function renderEvents() {
  if (!eventsList) {
    return;
  }

  const filteredEvents = allEvents.filter((event) => {
    if (currentFilter === "all") {
      return true;
    }

    return getEventStatus(event) === currentFilter;
  });

  if (!filteredEvents.length) {
    eventsList.innerHTML = `
      <p class="admin-events-empty">
        Nenhum evento encontrado neste filtro.
      </p>
    `;

    return;
  }

  eventsList.innerHTML = filteredEvents.map(createAdminEventCard).join("");
}

/* ==============================
   CARREGAR EVENTOS
================================ */

async function loadEvents() {
  if (!eventsList) {
    return;
  }

  eventsList.innerHTML = `
    <p class="admin-events-empty">
      Carregando eventos...
    </p>
  `;

  try {
    const eventsQuery = query(
      collection(db, "eventos"),
      orderBy("dataHoraInicio", "desc"),
    );

    const snapshot = await getDocs(eventsQuery);

    allEvents = snapshot.docs.map((documentSnapshot) => {
      return {
        id: documentSnapshot.id,
        ...documentSnapshot.data(),
      };
    });

    renderEvents();
  } catch (error) {
    console.error("[Admin] Erro ao carregar eventos:", error);

    eventsList.innerHTML = `
      <p class="admin-events-empty">
        Não foi possível carregar os eventos.
      </p>
    `;
  }
}

/* ==============================
   EDITAR EVENTO
================================ */

function editEvent(eventId) {
  const event = allEvents.find((item) => item.id === eventId);

  if (!event) {
    return;
  }

  eventIdInput.value = event.id;

  eventTitleInput.value = event.titulo || "";

  eventCategoryInput.value = event.categoria || "";

  eventFormatInput.value = event.formato || "";

  eventImageInput.value = getImageInputValue(event.imagem);

  eventStartInput.value = timestampToInputValue(event.dataHoraInicio);

  eventEndInput.value = timestampToInputValue(event.dataHoraFim);

  eventLocationInput.value = event.local || "";

  eventCityInput.value = event.cidade || "";

  eventLatitudeInput.value = event.latitude ?? "";

  eventLongitudeInput.value = event.longitude ?? "";

  eventDescriptionInput.value = event.descricao || "";

  eventActiveInput.checked = event.ativo === true;

  descriptionCharacterCount.textContent = String(
    eventDescriptionInput.value.length,
  );

  formTitle.textContent = "Editar evento";

  saveButton.textContent = "Atualizar evento";

  cancelEditButton.hidden = false;

  updateImagePreview();
  clearFormMessage();
  focusForm();
}

/* ==============================
   ATIVAR OU DESATIVAR
================================ */

async function toggleEventStatus(eventId) {
  const event = allEvents.find((item) => item.id === eventId);

  if (!event) {
    return;
  }

  try {
    await updateDoc(doc(db, "eventos", eventId), {
      ativo: event.ativo !== true,
      atualizadoEm: serverTimestamp(),
    });

    await loadEvents();
  } catch (error) {
    console.error("[Admin] Erro ao alterar status:", error);

    window.alert("Não foi possível alterar o status do evento.");
  }
}

/* ==============================
   EXCLUIR EVENTO
================================ */

async function removeEvent(eventId) {
  const event = allEvents.find((item) => item.id === eventId);

  if (!event) {
    return;
  }

  const confirmed = window.confirm(
    `Excluir definitivamente o evento “${event.titulo}”?`,
  );

  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(doc(db, "eventos", eventId));

    if (eventIdInput.value === eventId) {
      resetForm();
    }

    await loadEvents();
  } catch (error) {
    console.error("[Admin] Erro ao excluir:", error);

    window.alert("Não foi possível excluir o evento.");
  }
}

/* ==============================
   EVENTOS DA LISTA
================================ */

eventsList?.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-event-action]");

  if (!actionButton) {
    return;
  }

  const card = actionButton.closest("[data-event-id]");

  const eventId = card?.dataset.eventId;

  if (!eventId) {
    return;
  }

  const action = actionButton.dataset.eventAction;

  if (action === "edit") {
    editEvent(eventId);
  }

  if (action === "status") {
    toggleEventStatus(eventId);
  }

  if (action === "delete") {
    removeEvent(eventId);
  }
});

/* ==============================
   FILTROS
================================ */

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.eventFilter || "all";

    filterButtons.forEach((filterButton) => {
      filterButton.classList.toggle("is-active", filterButton === button);
    });

    renderEvents();
  });
});

/* ==============================
   OUTROS EVENTOS
================================ */

eventImageInput?.addEventListener("input", updateImagePreview);

eventDescriptionInput?.addEventListener("input", () => {
  descriptionCharacterCount.textContent = String(
    eventDescriptionInput.value.length,
  );
});

cancelEditButton?.addEventListener("click", resetForm);

newEventButton?.addEventListener("click", () => {
  resetForm();
  focusForm();
});

refreshEventsButton?.addEventListener("click", loadEvents);

/* ==============================
   INICIALIZAÇÃO
================================ */

async function initializeAdminPage() {
  const hasAccess = await verifyAdminAccess();

  if (!hasAccess) {
    return;
  }

  resetForm();
  await loadEvents();
}

initializeAdminPage();
