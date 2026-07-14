"use strict";

/* ==============================
   FIREBASE
================================ */

import { auth, db, googleProvider } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* ==============================
   ELEMENTOS DA PÁGINA
================================ */

const loginForm = document.getElementById("login-form");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const submitButton = loginForm?.querySelector('button[type="submit"]');

const googleLoginButton = document.getElementById("google-login-button");

const loginMessage = document.getElementById("login-message");

/* ==============================
   MENSAGENS
================================ */

function showMessage(message, type = "error") {
  if (!loginMessage) {
    window.alert(message);
    return;
  }

  loginMessage.textContent = message;
  loginMessage.hidden = false;

  loginMessage.classList.remove("is-error", "is-success");

  loginMessage.classList.add(type === "success" ? "is-success" : "is-error");
}

function clearMessage() {
  if (!loginMessage) {
    return;
  }

  loginMessage.textContent = "";
  loginMessage.hidden = true;

  loginMessage.classList.remove("is-error", "is-success");
}

/* ==============================
   ESTADO DE CARREGAMENTO
================================ */

function setLoading(isLoading, loginType = "email") {
  if (submitButton) {
    submitButton.disabled = isLoading;

    submitButton.textContent =
      isLoading && loginType === "email" ? "Entrando..." : "Login";
  }

  if (googleLoginButton) {
    googleLoginButton.disabled = isLoading;

    googleLoginButton.setAttribute("aria-busy", String(isLoading));
  }

  if (emailInput) {
    emailInput.disabled = isLoading;
  }

  if (passwordInput) {
    passwordInput.disabled = isLoading;
  }
}

/* ==============================
   DOCUMENTO DO USUÁRIO
================================ */

/*
  Garante que o usuário autenticado
  possua um documento no Firestore.

  Isso também cobre o caso de alguém
  entrar com Google diretamente pela
  página de login.
*/

async function ensureUserDocument(user, provider) {
  const userReference = doc(db, "usuarios", user.uid);

  const userSnapshot = await getDoc(userReference);

  const existingData = userSnapshot.exists() ? userSnapshot.data() : {};

  const fallbackName = user.email?.split("@")[0]?.trim() || "Usuário Origo";

  const userData = {
    uid: user.uid,

    nome: existingData.nome || user.displayName || fallbackName,

    email: user.email?.trim().toLowerCase() || "",

    provedor: existingData.provedor || provider,

    atualizadoEm: serverTimestamp(),
  };

  /*
    A foto do Google só é atualizada
    quando realmente existir.
  */

  if (user.photoURL) {
    userData.fotoURL = user.photoURL;
  }

  /*
    Se o documento ainda não existir,
    cria a estrutura inicial completa.
  */

  if (!userSnapshot.exists()) {
    Object.assign(userData, {
      celular: "",
      fotoURL: user.photoURL || "",
      tcgFavorito: "",
      personagemFavorito: "",
      deckUtilizado: "",
      disponivel: false,
      cidade: "",
      criadoEm: serverTimestamp(),
    });
  }

  await setDoc(userReference, userData, {
    merge: true,
  });
}

/* ==============================
   VALIDAÇÃO
================================ */

function validateLoginForm() {
  const email = emailInput?.value.trim() || "";

  const password = passwordInput?.value || "";

  if (!email) {
    showMessage("Digite seu endereço de e-mail.");

    emailInput?.focus();
    return null;
  }

  if (!emailInput?.validity.valid) {
    showMessage("Digite um endereço de e-mail válido.");

    emailInput?.focus();
    return null;
  }

  if (!password) {
    showMessage("Digite sua senha.");

    passwordInput?.focus();
    return null;
  }

  return {
    email,
    password,
  };
}

/* ==============================
   ERROS DO FIREBASE
================================ */

function getFirebaseErrorMessage(error) {
  const errorMessages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",

    "auth/invalid-email": "O endereço de e-mail informado é inválido.",

    "auth/user-disabled": "Esta conta foi desativada.",

    "auth/user-not-found": "E-mail ou senha incorretos.",

    "auth/wrong-password": "E-mail ou senha incorretos.",

    "auth/too-many-requests":
      "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",

    "auth/network-request-failed":
      "Não foi possível conectar ao Firebase. Verifique sua internet.",

    "auth/popup-closed-by-user":
      "A janela do Google foi fechada antes da conclusão.",

    "auth/popup-blocked": "O navegador bloqueou a janela de login do Google.",

    "auth/cancelled-popup-request":
      "A solicitação de login com Google foi cancelada.",

    "auth/account-exists-with-different-credential":
      "Este e-mail está associado a outra forma de login.",

    "auth/unauthorized-domain":
      "Este domínio ainda não está autorizado no Firebase Authentication.",

    "auth/operation-not-allowed":
      "Este método de login ainda não está ativado no Firebase.",

    "permission-denied":
      "O Firebase bloqueou o acesso ao perfil. Verifique as regras do Firestore.",
  };

  return (
    errorMessages[error?.code] ||
    "Não foi possível realizar o login. Tente novamente."
  );
}

/* ==============================
   REDIRECIONAMENTO
================================ */

function redirectToPrincipal() {
  window.location.href = "principal.html";
}

/* ==============================
   LOGIN COM E-MAIL E SENHA
================================ */

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearMessage();

  const formData = validateLoginForm();

  if (!formData) {
    return;
  }

  setLoading(true, "email");

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      formData.email,
      formData.password,
    );

    await ensureUserDocument(userCredential.user, "password");

    showMessage("Login realizado com sucesso!", "success");

    window.setTimeout(redirectToPrincipal, 500);
  } catch (error) {
    console.error("[Login] Falha ao entrar:", error);

    showMessage(getFirebaseErrorMessage(error));

    setLoading(false);
  }
});

/* ==============================
   LOGIN COM GOOGLE
================================ */

/*
  O Firebase recomenda usar o fluxo
  do SDK com GoogleAuthProvider e
  signInWithPopup em aplicações Web.
*/

googleLoginButton?.addEventListener("click", async () => {
  clearMessage();

  setLoading(true, "google");

  try {
    const result = await signInWithPopup(auth, googleProvider);

    await ensureUserDocument(result.user, "google");

    showMessage("Login com Google realizado com sucesso!", "success");

    window.setTimeout(redirectToPrincipal, 500);
  } catch (error) {
    console.error("[Login Google] Falha:", error);

    showMessage(getFirebaseErrorMessage(error));

    setLoading(false);
  }
});
