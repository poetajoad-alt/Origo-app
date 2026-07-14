"use strict";

/* ==============================
   FIREBASE
================================ */

import { auth, db } from "./firebase-config.js";

import { authReady } from "./auth-guard.js";

import { signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* ==============================
   ELEMENTOS DO MENU
================================ */

function getMenuElements() {
  return {
    userName: document.getElementById("side-menu-user-name"),

    userEmail: document.getElementById("side-menu-user-email"),

    userPhoto: document.getElementById("side-menu-user-photo"),

    avatarPlaceholder: document.getElementById("side-menu-avatar-placeholder"),

    logoutButton: document.getElementById("logout-button"),
    adminLink: document.getElementById("side-menu-admin-link"),
  };
}

/* ==============================
   NOME ALTERNATIVO
================================ */

function getFallbackName(user) {
  const authenticationName = user?.displayName?.trim();

  if (authenticationName) {
    return authenticationName;
  }

  const emailName = user?.email?.split("@")[0]?.trim();

  return emailName || "Usuário Origo";
}

/* ==============================
   INICIAL DO AVATAR
================================ */

function getNameInitial(name) {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    return "O";
  }

  return normalizedName.charAt(0).toUpperCase();
}

/* ==============================
   EXIBIR AVATAR
================================ */

function showUserAvatar({ photoURL, userName, userPhoto, avatarPlaceholder }) {
  if (avatarPlaceholder) {
    avatarPlaceholder.textContent = getNameInitial(userName);

    avatarPlaceholder.hidden = false;
  }

  if (!userPhoto) {
    return;
  }

  if (!photoURL) {
    userPhoto.hidden = true;
    userPhoto.removeAttribute("src");

    return;
  }

  userPhoto.src = photoURL;
  userPhoto.hidden = false;

  userPhoto.addEventListener(
    "load",
    () => {
      if (avatarPlaceholder) {
        avatarPlaceholder.hidden = true;
      }
    },
    {
      once: true,
    },
  );

  userPhoto.addEventListener(
    "error",
    () => {
      userPhoto.hidden = true;
      userPhoto.removeAttribute("src");

      if (avatarPlaceholder) {
        avatarPlaceholder.hidden = false;
      }
    },
    {
      once: true,
    },
  );
}

/* ==============================
   PREENCHER MENU
================================ */

function fillSideMenu({ name, email, photoURL }) {
  const { userName, userEmail, userPhoto, avatarPlaceholder } =
    getMenuElements();

  if (userName) {
    userName.textContent = name;
  }

  if (userEmail) {
    userEmail.textContent = email || "E-mail não informado";
  }

  showUserAvatar({
    photoURL,
    userName: name,
    userPhoto,
    avatarPlaceholder,
  });
}

/* ==============================
   CARREGAR DADOS DO FIRESTORE
================================ */
async function updateAdminMenu(user) {
  const { adminLink } = getMenuElements();

  if (!adminLink || !user) {
    return;
  }

  adminLink.hidden = true;

  try {
    const adminReference = doc(db, "admins", user.uid);

    const adminSnapshot = await getDoc(adminReference);

    const isAdmin =
      adminSnapshot.exists() && adminSnapshot.data().ativo === true;

    adminLink.hidden = !isAdmin;

    console.log("[Principal Auth] Acesso administrativo:", isAdmin);
  } catch (error) {
    console.error("[Principal Auth] Erro ao verificar administrador:", error);

    adminLink.hidden = true;
  }
}
async function loadSideMenuUser() {
  try {
    const user = await authReady;

    console.log("[Principal Auth] Usuário autenticado:", user.uid);

    const userReference = doc(db, "usuarios", user.uid);

    const userSnapshot = await getDoc(userReference);

    const userData = userSnapshot.exists() ? userSnapshot.data() : {};

    console.log("[Principal Auth] Dados encontrados:", userData);

    const name =
      typeof userData.nome === "string" && userData.nome.trim()
        ? userData.nome.trim()
        : getFallbackName(user);

    const email =
      typeof userData.email === "string" && userData.email.trim()
        ? userData.email.trim()
        : user.email || "";

    const photoURL =
      typeof userData.fotoURL === "string" && userData.fotoURL.trim()
        ? userData.fotoURL.trim()
        : user.photoURL || "";

    fillSideMenu({
      name,
      email,
      photoURL,
    });
    await updateAdminMenu(user);
  } catch (error) {
    console.error("[Principal Auth] Erro ao carregar usuário:", error);

    try {
      const user = await authReady;

      fillSideMenu({
        name: getFallbackName(user),
        email: user.email || "",
        photoURL: user.photoURL || "",
      });
      await updateAdminMenu(user);
    } catch (fallbackError) {
      console.error(
        "[Principal Auth] Falha também no fallback:",
        fallbackError,
      );
    }
  }
}

/* ==============================
   LOGOUT REAL
================================ */

function initializeLogout() {
  const { logoutButton } = getMenuElements();

  if (!logoutButton) {
    console.error("[Principal Auth] Botão logout-button não encontrado.");

    return;
  }

  logoutButton.addEventListener("click", async () => {
    const shouldLogout = window.confirm("Deseja sair da sua conta?");

    if (!shouldLogout) {
      return;
    }

    logoutButton.disabled = true;
    logoutButton.setAttribute("aria-busy", "true");

    const originalContent = logoutButton.innerHTML;

    logoutButton.textContent = "Saindo...";

    try {
      await signOut(auth);

      console.log("[Principal Auth] Logout realizado com sucesso.");

      window.location.replace("index.html");
    } catch (error) {
      console.error("[Principal Auth] Erro ao sair:", error);

      window.alert("Não foi possível sair da conta. Tente novamente.");

      logoutButton.disabled = false;
      logoutButton.setAttribute("aria-busy", "false");

      logoutButton.innerHTML = originalContent;
    }
  });
}

/* ==============================
   INICIALIZAÇÃO
================================ */

function initializePrincipalAuth() {
  initializeLogout();
  loadSideMenuUser();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePrincipalAuth, {
    once: true,
  });
} else {
  initializePrincipalAuth();
}
