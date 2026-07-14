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

const $ = (id) => document.getElementById(id);

const ui = {
  accessLoading: $("admin-access-loading"),
  page: $("admin-page"),
  formSection: $("admin-form-section"),
  formTitle: $("admin-form-title"),
  cancelButton: $("cancel-edit-button"),
  newButton: $("new-event-button"),
  newMenu: $("admin-new-menu"),
  listTitle: $("admin-events-title"),
  refreshButton: $("refresh-events-button"),
  list: $("admin-events-list"),
  eventFilters: $("admin-event-filters"),
  storeFilters: $("admin-store-filters"),
  eventsModeButton: $("admin-events-mode-button"),
  storesModeButton: $("admin-stores-mode-button"),
};

const eventFields = {
  form: $("admin-event-form"),
  id: $("event-id"),
  title: $("event-title"),
  category: $("event-category"),
  format: $("event-format"),
  image: $("event-image"),
  imagePreview: $("event-image-preview"),
  imageMessage: $("event-image-preview-message"),
  start: $("event-start"),
  end: $("event-end"),
  location: $("event-location"),
  city: $("event-city"),
  latitude: $("event-latitude"),
  longitude: $("event-longitude"),
  description: $("event-description"),
  characterCount: $("description-character-count"),
  active: $("event-active"),
  message: $("admin-form-message"),
  saveButton: $("save-event-button"),
};

const storeFields = {
  form: $("admin-store-form"),
  id: $("store-id"),
  name: $("store-name"),
  description: $("store-description"),
  characterCount: $("store-description-character-count"),
  image: $("store-image"),
  imagePreview: $("store-image-preview"),
  imageMessage: $("store-image-preview-message"),
  address: $("store-address"),
  neighborhood: $("store-neighborhood"),
  city: $("store-city"),
  state: $("store-state"),
  zipCode: $("store-zip-code"),
  latitude: $("store-latitude"),
  longitude: $("store-longitude"),
  phone: $("store-phone"),
  whatsapp: $("store-whatsapp"),
  instagram: $("store-instagram"),
  website: $("store-website"),
  hasTables: $("store-has-tables"),
  holdsEvents: $("store-holds-events"),
  partner: $("store-partner"),
  active: $("store-active"),
  message: $("admin-store-form-message"),
  saveButton: $("save-store-button"),
};

const createButtons = document.querySelectorAll("[data-create-type]");

const modeButtons = document.querySelectorAll("[data-admin-mode]");

const eventFilterButtons = document.querySelectorAll("[data-event-filter]");

const storeFilterButtons = document.querySelectorAll("[data-store-filter]");

const storeTcgInputs = document.querySelectorAll('input[name="store-tcg"]');

let currentAdminUser = null;

let currentMode = "events";

let currentEventFilter = "all";

let currentStoreFilter = "all";

let allEvents = [];

let allStores = [];

let isSaving = false;

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(element, text, type = "error") {
  if (!element) {
    return;
  }

  element.textContent = text;

  element.hidden = false;

  element.classList.remove("is-success", "is-error");

  element.classList.add(type === "success" ? "is-success" : "is-error");
}

function clearMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";

  element.hidden = true;

  element.classList.remove("is-success", "is-error");
}

function normalizeImagePath(value, prefix) {
  let name = String(value || "")
    .trim()
    .replaceAll("\\", "/");

  name = name.replace(/^\.?\/*assets\//i, "");

  if (name.includes("../") || name.includes("://") || name.includes("/")) {
    return null;
  }

  const pattern = new RegExp(
    `^${prefix}-\\d+\\.(jpg|jpeg|png|webp|avif)$`,
    "i",
  );

  return pattern.test(name) ? `assets/${name}` : null;
}

function imageInputValue(path) {
  return String(path || "").replace(/^assets\//i, "");
}

function updatePreview(fields, prefix, example) {
  const path = normalizeImagePath(fields.image?.value, prefix);

  if (!fields.imagePreview || !fields.imageMessage) {
    return;
  }

  if (!path) {
    fields.imagePreview.hidden = true;

    fields.imageMessage.hidden = false;

    fields.imageMessage.textContent = `Use um nome como ${example}.`;

    return;
  }

  fields.imageMessage.hidden = true;

  fields.imagePreview.hidden = false;

  fields.imagePreview.src = path;
}

function installPreviewEvents(fields) {
  fields.imagePreview?.addEventListener("load", () => {
    fields.imagePreview.hidden = false;

    fields.imageMessage.hidden = true;
  });

  fields.imagePreview?.addEventListener("error", () => {
    fields.imagePreview.hidden = true;

    fields.imageMessage.hidden = false;

    fields.imageMessage.textContent = "Imagem não encontrada na pasta assets.";
  });
}

function parseDateTime(value) {
  const date = new Date(String(value || "").trim());

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCoordinate(input) {
  const raw = String(input?.value || "").trim();

  if (!raw) {
    return null;
  }

  const value = Number(raw);

  return Number.isFinite(value) ? value : null;
}

function timestampToInput(timestamp) {
  if (!timestamp?.toDate) {
    return "";
  }

  const date = timestamp.toDate();

  const pad = (value) => {
    return String(value).padStart(2, "0");
  };

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}` +
    `T${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  );
}

function formatTimestamp(timestamp) {
  if (!timestamp?.toDate) {
    return "Data não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp.toDate());
}

async function verifyAdminAccess() {
  try {
    currentAdminUser = await authReady;

    const adminReference = doc(db, "admins", currentAdminUser.uid);

    const snapshot = await getDoc(adminReference);

    if (!snapshot.exists() || snapshot.data().ativo !== true) {
      window.alert("Sua conta não possui acesso administrativo.");

      window.location.replace("principal.html");

      return false;
    }

    ui.accessLoading.hidden = true;

    ui.page.hidden = false;

    return true;
  } catch (error) {
    console.error("[Admin] Erro ao verificar administrador:", error);

    window.alert("Não foi possível verificar o acesso administrativo.");

    window.location.replace("principal.html");

    return false;
  }
}

function setNewMenu(open) {
  ui.newButton?.setAttribute("aria-expanded", String(open));

  if (ui.newMenu) {
    ui.newMenu.hidden = !open;
  }
}

function closeForm() {
  if (ui.formSection) {
    ui.formSection.hidden = true;
  }

  if (ui.cancelButton) {
    ui.cancelButton.hidden = true;
  }

  clearMessage(eventFields.message);

  clearMessage(storeFields.message);
}

function focusForm(input) {
  ui.formSection.hidden = false;

  ui.formSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  window.setTimeout(() => {
    input?.focus();
  }, 350);
}

function updateModeUI() {
  const eventsMode = currentMode === "events";

  ui.eventsModeButton?.classList.toggle("is-active", eventsMode);

  ui.storesModeButton?.classList.toggle("is-active", !eventsMode);

  ui.eventsModeButton?.setAttribute("aria-selected", String(eventsMode));

  ui.storesModeButton?.setAttribute("aria-selected", String(!eventsMode));

  if (ui.eventFilters) {
    ui.eventFilters.hidden = !eventsMode;
  }

  if (ui.storeFilters) {
    ui.storeFilters.hidden = eventsMode;
  }

  if (ui.listTitle) {
    ui.listTitle.textContent = eventsMode
      ? "Eventos cadastrados"
      : "Lojas cadastradas";
  }
}

async function setMode(mode, reload = true) {
  currentMode = mode === "stores" ? "stores" : "events";

  setNewMenu(false);

  closeForm();

  updateModeUI();

  if (!reload) {
    renderCurrentList();

    return;
  }

  if (currentMode === "stores") {
    await loadStores();

    return;
  }

  await loadEvents();
}

function resetEventForm() {
  eventFields.form?.reset();

  eventFields.id.value = "";

  eventFields.active.checked = true;

  eventFields.image.value = "evento-1.jpg";

  eventFields.imagePreview.src = "assets/evento-1.jpg";

  eventFields.imagePreview.hidden = false;

  eventFields.imageMessage.hidden = true;

  eventFields.characterCount.textContent = "0";

  eventFields.saveButton.textContent = "Salvar evento";

  clearMessage(eventFields.message);
}

function resetStoreForm() {
  storeFields.form?.reset();

  storeFields.id.value = "";

  storeFields.hasTables.checked = true;

  storeFields.holdsEvents.checked = false;

  storeFields.partner.checked = false;

  storeFields.active.checked = true;

  storeFields.image.value = "";

  storeFields.imagePreview.src = "assets/logo-origo-index.png";

  storeFields.imagePreview.hidden = false;

  storeFields.imageMessage.hidden = true;

  storeFields.characterCount.textContent = "0";

  storeFields.saveButton.textContent = "Salvar loja";

  clearMessage(storeFields.message);
}

function openEventForm() {
  currentMode = "events";

  updateModeUI();

  loadEvents();

  resetEventForm();

  storeFields.form.hidden = true;

  eventFields.form.hidden = false;

  ui.formTitle.textContent = "Novo evento";

  ui.cancelButton.textContent = "Fechar formulário";

  ui.cancelButton.hidden = false;

  focusForm(eventFields.title);
}

function openStoreForm() {
  currentMode = "stores";

  updateModeUI();

  loadStores();

  resetStoreForm();

  eventFields.form.hidden = true;

  storeFields.form.hidden = false;

  ui.formTitle.textContent = "Nova loja";

  ui.cancelButton.textContent = "Fechar formulário";

  ui.cancelButton.hidden = false;

  focusForm(storeFields.name);
}

function eventFormData() {
  const start = parseDateTime(eventFields.start.value);

  const end = parseDateTime(eventFields.end.value);

  const latitude = parseCoordinate(eventFields.latitude);

  const longitude = parseCoordinate(eventFields.longitude);

  const image = normalizeImagePath(eventFields.image.value, "evento");

  const invalid = (message, input) => {
    showMessage(eventFields.message, message);

    input?.focus();

    return null;
  };

  if (eventFields.title.value.trim().length < 2) {
    return invalid("Digite o título do evento.", eventFields.title);
  }

  if (!eventFields.category.value) {
    return invalid("Selecione a categoria.", eventFields.category);
  }

  if (eventFields.format.value.trim().length < 2) {
    return invalid("Informe o formato do evento.", eventFields.format);
  }

  if (!image) {
    return invalid(
      "Use uma imagem válida, como evento-1.jpg.",
      eventFields.image,
    );
  }

  if (!start || !end) {
    return invalid("Informe as datas de início e término.", eventFields.start);
  }

  if (end <= start) {
    return invalid(
      "O término precisa ser posterior ao início.",
      eventFields.end,
    );
  }

  if (eventFields.location.value.trim().length < 2) {
    return invalid("Informe o local do evento.", eventFields.location);
  }

  if (eventFields.city.value.trim().length < 2) {
    return invalid("Informe a cidade.", eventFields.city);
  }

  if (latitude === null || latitude < -90 || latitude > 90) {
    return invalid("Informe uma latitude válida.", eventFields.latitude);
  }

  if (longitude === null || longitude < -180 || longitude > 180) {
    return invalid("Informe uma longitude válida.", eventFields.longitude);
  }

  if (eventFields.description.value.trim().length < 2) {
    return invalid(
      "Digite uma descrição para o evento.",
      eventFields.description,
    );
  }

  return {
    titulo: eventFields.title.value.trim(),

    categoria: eventFields.category.value.trim(),

    formato: eventFields.format.value.trim(),

    imagem: image,

    dataHoraInicio: Timestamp.fromDate(start),

    dataHoraFim: Timestamp.fromDate(end),

    local: eventFields.location.value.trim(),

    cidade: eventFields.city.value.trim(),

    latitude,

    longitude,

    descricao: eventFields.description.value.trim(),

    ativo: eventFields.active.checked,
  };
}

function storeFormData() {
  const latitude = parseCoordinate(storeFields.latitude);

  const longitude = parseCoordinate(storeFields.longitude);

  const image = normalizeImagePath(storeFields.image.value, "loja");

  const state = storeFields.state.value.trim().toUpperCase();

  const tcgs = Array.from(storeTcgInputs)
    .filter((input) => {
      return input.checked;
    })
    .map((input) => {
      return input.value;
    });

  const invalid = (message, input) => {
    showMessage(storeFields.message, message);

    input?.focus();

    return null;
  };

  if (storeFields.name.value.trim().length < 2) {
    return invalid("Digite o nome da loja.", storeFields.name);
  }

  if (storeFields.description.value.trim().length < 2) {
    return invalid(
      "Digite uma descrição para a loja.",
      storeFields.description,
    );
  }

  if (!image) {
    return invalid(
      "Use uma imagem válida, como loja-1.jpg.",
      storeFields.image,
    );
  }

  if (storeFields.address.value.trim().length < 3) {
    return invalid("Informe o endereço da loja.", storeFields.address);
  }

  if (storeFields.city.value.trim().length < 2) {
    return invalid("Informe a cidade da loja.", storeFields.city);
  }

  if (!/^[A-Z]{2}$/.test(state)) {
    return invalid(
      "Informe o estado com duas letras, como SP.",
      storeFields.state,
    );
  }

  if (latitude === null || latitude < -90 || latitude > 90) {
    return invalid("Informe uma latitude válida.", storeFields.latitude);
  }

  if (longitude === null || longitude < -180 || longitude > 180) {
    return invalid("Informe uma longitude válida.", storeFields.longitude);
  }

  if (!tcgs.length) {
    return invalid(
      "Selecione pelo menos um TCG disponível.",
      storeTcgInputs[0],
    );
  }

  const website = storeFields.website.value.trim();

  if (website) {
    try {
      const url = new URL(website);

      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Protocolo inválido");
      }
    } catch {
      return invalid(
        "Informe um site válido começando com http:// ou https://.",
        storeFields.website,
      );
    }
  }

  return {
    nome: storeFields.name.value.trim(),

    descricao: storeFields.description.value.trim(),

    imagem: image,

    endereco: storeFields.address.value.trim(),

    bairro: storeFields.neighborhood.value.trim(),

    cidade: storeFields.city.value.trim(),

    estado: state,

    cep: storeFields.zipCode.value.trim(),

    latitude,

    longitude,

    telefone: storeFields.phone.value.trim(),

    whatsapp: storeFields.whatsapp.value.trim(),

    instagram: storeFields.instagram.value.trim(),

    site: website,

    tcgs,

    possuiMesas: storeFields.hasTables.checked,

    realizaEventos: storeFields.holdsEvents.checked,

    parceira: storeFields.partner.checked,

    ativo: storeFields.active.checked,
  };
}

function setSaving(fields, saving, entity) {
  isSaving = saving;

  fields.saveButton.disabled = saving;

  fields.saveButton.textContent = saving
    ? "Salvando..."
    : fields.id.value
      ? `Atualizar ${entity}`
      : `Salvar ${entity}`;
}

eventFields.form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSaving) {
    return;
  }

  clearMessage(eventFields.message);

  const data = eventFormData();

  if (!data) {
    return;
  }

  setSaving(eventFields, true, "evento");

  try {
    const id = eventFields.id.value.trim();

    if (id) {
      await updateDoc(doc(db, "eventos", id), {
        ...data,
        atualizadoEm: serverTimestamp(),
      });

      showMessage(
        eventFields.message,
        "Evento atualizado com sucesso!",
        "success",
      );
    } else {
      await addDoc(collection(db, "eventos"), {
        ...data,
        criadoEm: serverTimestamp(),

        atualizadoEm: serverTimestamp(),
      });

      showMessage(eventFields.message, "Evento criado com sucesso!", "success");
    }

    await loadEvents();

    window.setTimeout(() => {
      resetEventForm();

      closeForm();
    }, 900);
  } catch (error) {
    console.error("[Admin] Erro ao salvar evento:", error);

    showMessage(
      eventFields.message,

      error?.code === "permission-denied"
        ? "O Firebase bloqueou a operação. Confira as regras da coleção eventos."
        : "Não foi possível salvar o evento.",
    );
  } finally {
    setSaving(eventFields, false, "evento");
  }
});

storeFields.form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSaving) {
    return;
  }

  clearMessage(storeFields.message);

  const data = storeFormData();

  if (!data) {
    return;
  }

  setSaving(storeFields, true, "loja");

  try {
    const id = storeFields.id.value.trim();

    if (id) {
      await updateDoc(doc(db, "lojas", id), {
        ...data,
        atualizadoEm: serverTimestamp(),
      });

      showMessage(
        storeFields.message,
        "Loja atualizada com sucesso!",
        "success",
      );
    } else {
      await addDoc(collection(db, "lojas"), {
        ...data,

        criadoEm: serverTimestamp(),

        atualizadoEm: serverTimestamp(),
      });

      showMessage(storeFields.message, "Loja criada com sucesso!", "success");
    }

    await loadStores();

    window.setTimeout(() => {
      resetStoreForm();

      closeForm();
    }, 900);
  } catch (error) {
    console.error("[Admin] Erro ao salvar loja:", error);

    showMessage(
      storeFields.message,

      error?.code === "permission-denied"
        ? "O Firebase bloqueou a operação. Confira as regras da coleção lojas."
        : "Não foi possível salvar a loja.",
    );
  } finally {
    setSaving(storeFields, false, "loja");
  }
});

function eventStatus(item) {
  const end = item.dataHoraFim?.toDate?.();

  if (end && end < new Date()) {
    return "finished";
  }

  return item.ativo === true ? "active" : "inactive";
}

function eventCard(item) {
  const status = eventStatus(item);

  const labels = {
    active: "Ativo",
    inactive: "Inativo",
    finished: "Finalizado",
  };

  return `
    <article
      class="admin-event-card"
      data-event-id="${escapeHTML(item.id)}"
    >
      <div class="admin-event-card-image">
        <img
          src="${escapeHTML(item.imagem)}"
          alt="${escapeHTML(item.titulo)}"
        >

        <span
          class="
            admin-event-status
            ${status === "inactive" ? "is-inactive" : ""}
            ${status === "finished" ? "is-finished" : ""}
          "
        >
          ${labels[status]}
        </span>
      </div>

      <div class="admin-event-card-content">
        <span class="admin-event-category">
          ${escapeHTML(item.categoria)}
        </span>

        <h3>
          ${escapeHTML(item.titulo)}
        </h3>

        <div class="admin-event-meta">
          <p>
            <strong>Início:</strong>
            ${escapeHTML(formatTimestamp(item.dataHoraInicio))}
          </p>

          <p>
            <strong>Término:</strong>
            ${escapeHTML(formatTimestamp(item.dataHoraFim))}
          </p>

          <p>
            <strong>Local:</strong>
            ${escapeHTML(item.local)}
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
            ${item.ativo ? "Desativar" : "Ativar"}
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

function storeCard(item) {
  const inactive = item.ativo !== true;

  const partner = item.parceira === true;

  const statusLabel = inactive ? "Inativa" : partner ? "Parceira" : "Ativa";

  const statusClass = inactive
    ? "is-inactive"
    : partner
      ? "is-partner"
      : "is-common";

  const location = [item.cidade, item.estado].filter(Boolean).join(" - ");

  const tcgs = Array.isArray(item.tcgs)
    ? item.tcgs.join(", ")
    : "Não informado";

  return `
    <article
      class="admin-event-card"
      data-store-id="${escapeHTML(item.id)}"
    >
      <div class="admin-event-card-image">
        <img
          src="${escapeHTML(item.imagem)}"
          alt="${escapeHTML(item.nome)}"
        >

        <span
          class="admin-event-status ${statusClass}"
        >
          ${statusLabel}
        </span>
      </div>

      <div class="admin-event-card-content">
        <span class="admin-event-category">
          ${partner ? "Parceira Origo" : "Loja cadastrada"}
        </span>

        <h3>
          ${escapeHTML(item.nome)}
        </h3>

        <div class="admin-event-meta">
          <p>
            <strong>Local:</strong>
            ${escapeHTML(location || "Não informado")}
          </p>

          <p>
            <strong>Endereço:</strong>
            ${escapeHTML(item.endereco || "Não informado")}
          </p>

          <p>
            <strong>TCGs:</strong>
            ${escapeHTML(tcgs)}
          </p>
        </div>

        <div class="admin-event-card-actions">
          <button
            class="admin-event-action"
            type="button"
            data-store-action="edit"
          >
            Editar
          </button>

          <button
            class="admin-event-action is-status"
            type="button"
            data-store-action="status"
          >
            ${item.ativo ? "Desativar" : "Ativar"}
          </button>

          <button
            class="admin-event-action is-delete"
            type="button"
            data-store-action="delete"
          >
            Excluir
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderEvents() {
  const items = allEvents.filter((item) => {
    return (
      currentEventFilter === "all" || eventStatus(item) === currentEventFilter
    );
  });

  ui.list.innerHTML = items.length
    ? items.map(eventCard).join("")
    : `
          <p class="admin-events-empty">
            Nenhum evento encontrado neste filtro.
          </p>
        `;
}

function renderStores() {
  const items = allStores.filter((item) => {
    if (currentStoreFilter === "all") {
      return true;
    }

    if (currentStoreFilter === "active") {
      return item.ativo === true;
    }

    if (currentStoreFilter === "inactive") {
      return item.ativo !== true;
    }

    if (currentStoreFilter === "partner") {
      return item.parceira === true;
    }

    return true;
  });

  ui.list.innerHTML = items.length
    ? items.map(storeCard).join("")
    : `
          <p class="admin-events-empty">
            Nenhuma loja encontrada neste filtro.
          </p>
        `;
}

function renderCurrentList() {
  if (currentMode === "stores") {
    renderStores();

    return;
  }

  renderEvents();
}

async function loadEvents() {
  ui.list.innerHTML = `
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

    allEvents = snapshot.docs.map((item) => {
      return {
        id: item.id,
        ...item.data(),
      };
    });

    if (currentMode === "events") {
      renderEvents();
    }
  } catch (error) {
    console.error("[Admin] Erro ao carregar eventos:", error);

    ui.list.innerHTML = `
      <p class="admin-events-empty">
        Não foi possível carregar os eventos.
      </p>
    `;
  }
}

async function loadStores() {
  ui.list.innerHTML = `
    <p class="admin-events-empty">
      Carregando lojas...
    </p>
  `;

  try {
    const snapshot = await getDocs(collection(db, "lojas"));

    allStores = snapshot.docs
      .map((item) => {
        return {
          id: item.id,
          ...item.data(),
        };
      })
      .sort((first, second) => {
        return String(first.nome || "").localeCompare(
          String(second.nome || ""),

          "pt-BR",
        );
      });

    if (currentMode === "stores") {
      renderStores();
    }
  } catch (error) {
    console.error("[Admin] Erro ao carregar lojas:", error);

    ui.list.innerHTML = `
      <p class="admin-events-empty">
        Não foi possível carregar as lojas.
      </p>
    `;
  }
}

function editEvent(id) {
  const item = allEvents.find((event) => {
    return event.id === id;
  });

  if (!item) {
    return;
  }

  currentMode = "events";

  updateModeUI();

  resetEventForm();

  eventFields.id.value = item.id;

  eventFields.title.value = item.titulo || "";

  eventFields.category.value = item.categoria || "";

  eventFields.format.value = item.formato || "";

  eventFields.image.value = imageInputValue(item.imagem);

  eventFields.start.value = timestampToInput(item.dataHoraInicio);

  eventFields.end.value = timestampToInput(item.dataHoraFim);

  eventFields.location.value = item.local || "";

  eventFields.city.value = item.cidade || "";

  eventFields.latitude.value = item.latitude ?? "";

  eventFields.longitude.value = item.longitude ?? "";

  eventFields.description.value = item.descricao || "";

  eventFields.active.checked = item.ativo === true;

  eventFields.characterCount.textContent = String(
    eventFields.description.value.length,
  );

  storeFields.form.hidden = true;

  eventFields.form.hidden = false;

  ui.formTitle.textContent = "Editar evento";

  ui.cancelButton.textContent = "Cancelar edição";

  ui.cancelButton.hidden = false;

  eventFields.saveButton.textContent = "Atualizar evento";

  updatePreview(eventFields, "evento", "evento-1.jpg");

  focusForm(eventFields.title);
}

function editStore(id) {
  const item = allStores.find((store) => {
    return store.id === id;
  });

  if (!item) {
    return;
  }

  currentMode = "stores";

  updateModeUI();

  resetStoreForm();

  storeFields.id.value = item.id;

  storeFields.name.value = item.nome || "";

  storeFields.description.value = item.descricao || "";

  storeFields.image.value = imageInputValue(item.imagem);

  storeFields.address.value = item.endereco || "";

  storeFields.neighborhood.value = item.bairro || "";

  storeFields.city.value = item.cidade || "";

  storeFields.state.value = item.estado || "";

  storeFields.zipCode.value = item.cep || "";

  storeFields.latitude.value = item.latitude ?? "";

  storeFields.longitude.value = item.longitude ?? "";

  storeFields.phone.value = item.telefone || "";

  storeFields.whatsapp.value = item.whatsapp || "";

  storeFields.instagram.value = item.instagram || "";

  storeFields.website.value = item.site || "";

  storeFields.hasTables.checked = item.possuiMesas === true;

  storeFields.holdsEvents.checked = item.realizaEventos === true;

  storeFields.partner.checked = item.parceira === true;

  storeFields.active.checked = item.ativo === true;

  const tcgs = Array.isArray(item.tcgs) ? item.tcgs : [];

  storeTcgInputs.forEach((input) => {
    input.checked = tcgs.includes(input.value);
  });

  storeFields.characterCount.textContent = String(
    storeFields.description.value.length,
  );

  eventFields.form.hidden = true;

  storeFields.form.hidden = false;

  ui.formTitle.textContent = "Editar loja";

  ui.cancelButton.textContent = "Cancelar edição";

  ui.cancelButton.hidden = false;

  storeFields.saveButton.textContent = "Atualizar loja";

  updatePreview(storeFields, "loja", "loja-1.jpg");

  focusForm(storeFields.name);
}

async function toggleStatus(collectionName, id, item, loadFunction, label) {
  try {
    await updateDoc(doc(db, collectionName, id), {
      ativo: item.ativo !== true,

      atualizadoEm: serverTimestamp(),
    });

    await loadFunction();
  } catch (error) {
    console.error(`[Admin] Erro ao alterar status de ${label}:`, error);

    window.alert(`Não foi possível alterar o status de ${label}.`);
  }
}

async function removeItem(
  collectionName,
  id,
  itemName,
  title,
  loadFunction,
  resetFunction,
) {
  const confirmed = window.confirm(
    `Excluir definitivamente ${title} “${itemName}”?`,
  );

  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(doc(db, collectionName, id));

    resetFunction();

    closeForm();

    await loadFunction();
  } catch (error) {
    console.error(`[Admin] Erro ao excluir ${title}:`, error);

    window.alert(`Não foi possível excluir ${title}.`);
  }
}

ui.list?.addEventListener("click", (event) => {
  const eventButton = event.target.closest("[data-event-action]");

  if (eventButton) {
    const id = eventButton.closest("[data-event-id]")?.dataset.eventId;

    const item = allEvents.find((entry) => {
      return entry.id === id;
    });

    if (!id || !item) {
      return;
    }

    const action = eventButton.dataset.eventAction;

    if (action === "edit") {
      editEvent(id);
    }

    if (action === "status") {
      toggleStatus("eventos", id, item, loadEvents, "evento");
    }

    if (action === "delete") {
      removeItem(
        "eventos",
        id,
        item.titulo,
        "o evento",
        loadEvents,
        resetEventForm,
      );
    }

    return;
  }

  const storeButton = event.target.closest("[data-store-action]");

  if (!storeButton) {
    return;
  }

  const id = storeButton.closest("[data-store-id]")?.dataset.storeId;

  const item = allStores.find((entry) => {
    return entry.id === id;
  });

  if (!id || !item) {
    return;
  }

  const action = storeButton.dataset.storeAction;

  if (action === "edit") {
    editStore(id);
  }

  if (action === "status") {
    toggleStatus("lojas", id, item, loadStores, "loja");
  }

  if (action === "delete") {
    removeItem("lojas", id, item.nome, "a loja", loadStores, resetStoreForm);
  }
});

eventFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentEventFilter = button.dataset.eventFilter || "all";

    eventFilterButtons.forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });

    renderEvents();
  });
});

storeFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentStoreFilter = button.dataset.storeFilter || "all";

    storeFilterButtons.forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });

    renderStores();
  });
});

ui.newButton?.addEventListener("click", () => {
  const menuIsOpen = ui.newButton.getAttribute("aria-expanded") === "true";

  setNewMenu(!menuIsOpen);
});

createButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setNewMenu(false);

    if (button.dataset.createType === "store") {
      openStoreForm();

      return;
    }

    openEventForm();
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.adminMode === "stores" ? "stores" : "events";

    setMode(mode);
  });
});

ui.refreshButton?.addEventListener("click", () => {
  if (currentMode === "stores") {
    loadStores();

    return;
  }

  loadEvents();
});

ui.cancelButton?.addEventListener("click", () => {
  if (currentMode === "stores") {
    resetStoreForm();
  } else {
    resetEventForm();
  }

  closeForm();
});

document.addEventListener("click", (event) => {
  if (!ui.newMenu?.hidden && !event.target.closest(".admin-new-control")) {
    setNewMenu(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setNewMenu(false);
  }
});

eventFields.image?.addEventListener("input", () => {
  updatePreview(eventFields, "evento", "evento-1.jpg");
});

storeFields.image?.addEventListener("input", () => {
  updatePreview(storeFields, "loja", "loja-1.jpg");
});

eventFields.description?.addEventListener("input", () => {
  eventFields.characterCount.textContent = String(
    eventFields.description.value.length,
  );
});

storeFields.description?.addEventListener("input", () => {
  storeFields.characterCount.textContent = String(
    storeFields.description.value.length,
  );
});

storeFields.state?.addEventListener("input", () => {
  storeFields.state.value = storeFields.state.value.toUpperCase().slice(0, 2);
});

storeFields.zipCode?.addEventListener("input", () => {
  const digits = storeFields.zipCode.value.replace(/\D/g, "").slice(0, 8);

  storeFields.zipCode.value =
    digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
});

installPreviewEvents(eventFields);

installPreviewEvents(storeFields);

async function initializeAdminPage() {
  const hasAccess = await verifyAdminAccess();

  if (!hasAccess) {
    return;
  }

  resetEventForm();

  resetStoreForm();

  closeForm();

  updateModeUI();

  await loadEvents();
}

initializeAdminPage();
