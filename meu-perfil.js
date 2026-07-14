"use strict";

/* ==============================
   FIREBASE
================================ */

import { db } from "./firebase-config.js";

import { authReady } from "./auth-guard.js";

import { updateProfile } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* ==============================
   ELEMENTOS DO PERFIL
================================ */

const profileForm = document.getElementById("profile-form");

const profileUserName = document.getElementById("profile-user-name");

const profilePhoto = document.getElementById("profile-photo");

const profileAvatarPlaceholder = document.getElementById(
  "profile-avatar-placeholder",
);

const profileNameInput = document.getElementById("profile-name");

const profileEmailInput = document.getElementById("profile-email");

const profilePhoneInput = document.getElementById("profile-phone");

const profileFavoriteTcgInput = document.getElementById("profile-favorite-tcg");

const profileFavoriteCharacterInput = document.getElementById(
  "profile-favorite-character",
);

const profileDeckInput = document.getElementById("profile-deck");

const profileCityInput = document.getElementById("profile-city");

const profileAppearOnMapInput = document.getElementById("profile-appear-map");

const profileAvailableInput = document.getElementById("profile-available");

const profileLocationButton = document.getElementById(
  "profile-location-button",
);

const profileLocationStatus = document.getElementById(
  "profile-location-status",
);

const profileMessage = document.getElementById("profile-message");

const profileSaveButton = document.getElementById("profile-save-button");

/* ==============================
   ESTADO DA PÁGINA
================================ */

let currentApproximateLocation = null;
let currentPhotoURL = "";
let profileIsLoading = false;

/* ==============================
   DADOS ALTERNATIVOS
================================ */

function getFallbackName(user) {
  if (user.displayName?.trim()) {
    return user.displayName.trim();
  }

  if (user.email) {
    return user.email.split("@")[0]?.trim() || "Usuário Origo";
  }

  return "Usuário Origo";
}

function getNameInitial(name) {
  const normalizedName = String(name || "").trim();

  return normalizedName ? normalizedName.charAt(0).toUpperCase() : "O";
}

/* ==============================
   CELULAR
================================ */

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidBrazilianPhone(phone) {
  const normalizedPhone = normalizePhone(phone);

  return (
    normalizedPhone.length === 0 ||
    normalizedPhone.length === 10 ||
    normalizedPhone.length === 11
  );
}

/* ==============================
   MENSAGENS
================================ */

function showProfileMessage(message, type = "error") {
  if (!profileMessage) {
    window.alert(message);
    return;
  }

  profileMessage.textContent = message;
  profileMessage.hidden = false;

  profileMessage.classList.remove("is-success", "is-error");

  profileMessage.classList.add(type === "success" ? "is-success" : "is-error");
}

function clearProfileMessage() {
  if (!profileMessage) {
    return;
  }

  profileMessage.textContent = "";
  profileMessage.hidden = true;

  profileMessage.classList.remove("is-success", "is-error");
}

function showLocationStatus(message, type = "neutral") {
  if (!profileLocationStatus) {
    return;
  }

  profileLocationStatus.textContent = message;

  profileLocationStatus.classList.remove("is-success", "is-error");

  if (type === "success") {
    profileLocationStatus.classList.add("is-success");
  }

  if (type === "error") {
    profileLocationStatus.classList.add("is-error");
  }
}

/* ==============================
   ESTADO DOS CONTROLES DO MAPA
================================ */

function updateMapControlsState() {
  const appearOnMap = Boolean(profileAppearOnMapInput?.checked);

  if (profileAvailableInput) {
    if (!appearOnMap) {
      profileAvailableInput.checked = false;
    }

    profileAvailableInput.disabled = profileIsLoading || !appearOnMap;
  }

  if (profileLocationButton) {
    profileLocationButton.disabled = profileIsLoading || !appearOnMap;
  }

  if (!appearOnMap && !profileIsLoading) {
    showLocationStatus(
      "Ative “Aparecer no mapa” para configurar sua localização.",
    );

    return;
  }

  if (appearOnMap && currentApproximateLocation) {
    showLocationStatus(
      "Localização aproximada pronta para ser salva.",
      "success",
    );

    return;
  }

  if (appearOnMap && !profileIsLoading) {
    showLocationStatus(
      "Use o botão abaixo para definir sua localização aproximada.",
    );
  }
}

/* ==============================
   CARREGAMENTO
================================ */

function setProfileLoading(isLoading) {
  profileIsLoading = isLoading;

  if (profileSaveButton) {
    profileSaveButton.disabled = isLoading;

    profileSaveButton.textContent = isLoading
      ? "Salvando..."
      : "Salvar alterações";
  }

  [
    profileNameInput,
    profilePhoneInput,
    profileFavoriteTcgInput,
    profileFavoriteCharacterInput,
    profileDeckInput,
    profileCityInput,
    profileAppearOnMapInput,
  ].forEach((input) => {
    if (input) {
      input.disabled = isLoading;
    }
  });

  updateMapControlsState();
}

/* ==============================
   PREENCHIMENTO
================================ */

function fillInput(input, value) {
  if (!input) {
    return;
  }

  input.value = value === null || value === undefined ? "" : String(value);
}

/* ==============================
   FOTO DO PERFIL
================================ */

function showProfilePhoto(photoURL, userName) {
  if (profileAvatarPlaceholder) {
    profileAvatarPlaceholder.textContent = getNameInitial(userName);

    profileAvatarPlaceholder.hidden = false;
  }

  if (!profilePhoto) {
    return;
  }

  if (!photoURL) {
    profilePhoto.hidden = true;
    profilePhoto.removeAttribute("src");

    return;
  }

  profilePhoto.src = photoURL;
  profilePhoto.hidden = false;

  profilePhoto.addEventListener(
    "load",
    () => {
      if (profileAvatarPlaceholder) {
        profileAvatarPlaceholder.hidden = true;
      }
    },
    {
      once: true,
    },
  );

  profilePhoto.addEventListener(
    "error",
    () => {
      profilePhoto.hidden = true;
      profilePhoto.removeAttribute("src");

      if (profileAvatarPlaceholder) {
        profileAvatarPlaceholder.hidden = false;
      }
    },
    {
      once: true,
    },
  );
}

/* ==============================
   PREENCHER PERFIL
================================ */

function fillProfile({
  name,
  email,
  phone,
  photoURL,
  favoriteTcg,
  favoriteCharacter,
  deck,
  city,
  appearOnMap,
  available,
  approximateLocation,
}) {
  if (profileUserName) {
    profileUserName.textContent = name;
  }

  fillInput(profileNameInput, name);
  fillInput(profileEmailInput, email);
  fillInput(profilePhoneInput, phone);

  fillInput(profileFavoriteTcgInput, favoriteTcg);

  fillInput(profileFavoriteCharacterInput, favoriteCharacter);

  fillInput(profileDeckInput, deck);
  fillInput(profileCityInput, city);

  if (profileAppearOnMapInput) {
    profileAppearOnMapInput.checked = Boolean(appearOnMap);
  }

  if (profileAvailableInput) {
    profileAvailableInput.checked = Boolean(appearOnMap && available);
  }

  currentApproximateLocation = approximateLocation;

  currentPhotoURL = photoURL || "";

  showProfilePhoto(currentPhotoURL, name);

  updateMapControlsState();
}

/* ==============================
   CARREGAR PERFIL
================================ */

async function loadUserProfile() {
  try {
    const user = await authReady;

    const userReference = doc(db, "usuarios", user.uid);

    const publicProfileReference = doc(db, "perfisPublicos", user.uid);

    const [userSnapshot, publicProfileSnapshot] = await Promise.all([
      getDoc(userReference),
      getDoc(publicProfileReference),
    ]);

    const userData = userSnapshot.exists() ? userSnapshot.data() : {};

    const publicData = publicProfileSnapshot.exists()
      ? publicProfileSnapshot.data()
      : {};

    const userName = userData.nome?.trim() || getFallbackName(user);

    const publicProfileExists = publicProfileSnapshot.exists();

    const latitude = Number(publicData.latitude);

    const longitude = Number(publicData.longitude);

    const approximateLocation =
      publicProfileExists &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
        ? {
            latitude,
            longitude,
          }
        : null;

    fillProfile({
      name: userName,

      email: userData.email?.trim() || user.email?.trim() || "",

      phone: userData.celular || "",

      photoURL: userData.fotoURL?.trim() || user.photoURL || "",

      favoriteTcg: userData.tcgFavorito || "",

      favoriteCharacter: userData.personagemFavorito || "",

      deck: userData.deckUtilizado || "",

      city: userData.cidade || publicData.cidade || "",

      appearOnMap: userData.aparecerNoMapa === true && publicProfileExists,

      available: userData.disponivel === true || publicData.disponivel === true,

      approximateLocation,
    });
  } catch (error) {
    console.error("[Meu Perfil] Não foi possível carregar o perfil:", error);

    try {
      const user = await authReady;

      const fallbackName = getFallbackName(user);

      fillProfile({
        name: fallbackName,
        email: user.email || "",
        phone: "",
        photoURL: user.photoURL || "",
        favoriteTcg: "",
        favoriteCharacter: "",
        deck: "",
        city: "",
        appearOnMap: false,
        available: false,
        approximateLocation: null,
      });
    } catch {
      if (profileUserName) {
        profileUserName.textContent = "Usuário Origo";
      }
    }
  }
}

/* ==============================
   LOCALIZAÇÃO APROXIMADA
================================ */

function getApproximateLocation(latitude, longitude) {
  return {
    latitude: Number(latitude.toFixed(2)),

    longitude: Number(longitude.toFixed(2)),
  };
}

function getLocationErrorMessage(error) {
  const messages = {
    1: "Permissão de localização negada. Libere o acesso no navegador.",

    2: "Não foi possível determinar sua localização.",

    3: "A busca pela localização demorou demais. Tente novamente.",
  };

  return messages[error?.code] || "Não foi possível acessar sua localização.";
}

function captureApproximateLocation() {
  clearProfileMessage();

  if (!profileAppearOnMapInput?.checked) {
    showProfileMessage(
      "Ative a opção “Aparecer no mapa” antes de definir sua localização.",
    );

    return;
  }

  if (!navigator.geolocation) {
    showLocationStatus(
      "Seu navegador não oferece suporte à localização.",
      "error",
    );

    return;
  }

  if (profileLocationButton) {
    profileLocationButton.disabled = true;

    profileLocationButton.textContent = "Localizando...";
  }

  showLocationStatus("Buscando sua localização aproximada...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentApproximateLocation = getApproximateLocation(
        position.coords.latitude,
        position.coords.longitude,
      );

      showLocationStatus(
        "Localização aproximada capturada. Clique em “Salvar alterações”.",
        "success",
      );

      if (profileLocationButton) {
        profileLocationButton.textContent = "Atualizar localização";
      }

      updateMapControlsState();
    },

    (error) => {
      console.error("[Meu Perfil] Erro de localização:", error);

      showLocationStatus(getLocationErrorMessage(error), "error");

      if (profileLocationButton) {
        profileLocationButton.textContent = "Usar minha localização";
      }

      updateMapControlsState();
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    },
  );
}

/* ==============================
   VALIDAÇÃO
================================ */

function validateProfileForm() {
  const name = profileNameInput?.value.trim() || "";

  const phone = profilePhoneInput?.value.trim() || "";

  const favoriteTcg = profileFavoriteTcgInput?.value.trim() || "";

  const favoriteCharacter = profileFavoriteCharacterInput?.value.trim() || "";

  const deck = profileDeckInput?.value.trim() || "";

  const city = profileCityInput?.value.trim() || "";

  const appearOnMap = Boolean(profileAppearOnMapInput?.checked);

  const available = Boolean(appearOnMap && profileAvailableInput?.checked);

  if (name.length < 2) {
    showProfileMessage("Digite um nome válido.");

    profileNameInput?.focus();

    return null;
  }

  if (!isValidBrazilianPhone(phone)) {
    showProfileMessage("Digite um celular válido com DDD.");

    profilePhoneInput?.focus();

    return null;
  }

  if (appearOnMap && city.length < 2) {
    showProfileMessage("Informe sua cidade para aparecer no mapa.");

    profileCityInput?.focus();

    return null;
  }

  if (appearOnMap && !currentApproximateLocation) {
    showProfileMessage(
      "Defina sua localização aproximada antes de aparecer no mapa.",
    );

    profileLocationButton?.focus();

    return null;
  }

  return {
    name,
    phone,
    favoriteTcg,
    favoriteCharacter,
    deck,
    city,
    appearOnMap,
    available,
  };
}

/* ==============================
   EVENTOS DOS CONTROLES
================================ */

profileAppearOnMapInput?.addEventListener("change", () => {
  clearProfileMessage();
  updateMapControlsState();
});

profileLocationButton?.addEventListener("click", captureApproximateLocation);

/* ==============================
   SALVAR PERFIL
================================ */

profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearProfileMessage();

  const profileData = validateProfileForm();

  if (!profileData) {
    return;
  }

  setProfileLoading(true);

  try {
    const user = await authReady;

    const userReference = doc(db, "usuarios", user.uid);

    const publicProfileReference = doc(db, "perfisPublicos", user.uid);

    const publicProfileSnapshot = await getDoc(publicProfileReference);

    const batch = writeBatch(db);

    batch.set(
      userReference,
      {
        uid: user.uid,

        nome: profileData.name,

        email: user.email?.trim().toLowerCase() || "",

        celular: normalizePhone(profileData.phone),

        tcgFavorito: profileData.favoriteTcg,

        personagemFavorito: profileData.favoriteCharacter,

        deckUtilizado: profileData.deck,

        cidade: profileData.city,

        aparecerNoMapa: profileData.appearOnMap,

        disponivel: profileData.available,

        atualizadoEm: serverTimestamp(),
      },
      {
        merge: true,
      },
    );

    if (profileData.appearOnMap) {
      const publicProfileData = {
        uid: user.uid,

        tipo: "player",

        nome: profileData.name,

        fotoURL: currentPhotoURL || user.photoURL || "",

        tcgFavorito: profileData.favoriteTcg,

        personagemFavorito: profileData.favoriteCharacter,

        deckUtilizado: profileData.deck,

        cidade: profileData.city,

        disponivel: profileData.available,

        latitude: currentApproximateLocation.latitude,

        longitude: currentApproximateLocation.longitude,

        ativo: true,

        atualizadoEm: serverTimestamp(),
      };

      if (!publicProfileSnapshot.exists()) {
        publicProfileData.criadoEm = serverTimestamp();
      }

      batch.set(publicProfileReference, publicProfileData, {
        merge: true,
      });
    } else {
      batch.delete(publicProfileReference);
    }

    await batch.commit();

    if (user.displayName !== profileData.name) {
      await updateProfile(user, {
        displayName: profileData.name,
      });
    }

    if (profileUserName) {
      profileUserName.textContent = profileData.name;
    }

    showProfileMessage(
      profileData.appearOnMap
        ? "Perfil salvo e publicado no mapa!"
        : "Perfil atualizado com sucesso!",

      "success",
    );
  } catch (error) {
    console.error("[Meu Perfil] Não foi possível salvar as alterações:", error);

    showProfileMessage(
      error?.code === "permission-denied"
        ? "O Firebase bloqueou a publicação. Confira as regras do Firestore."
        : "Não foi possível salvar o perfil. Tente novamente.",
    );
  } finally {
    setProfileLoading(false);
  }
});

/* ==============================
   INICIALIZAÇÃO
================================ */

loadUserProfile();
