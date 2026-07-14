"use strict";

/* ==============================
   FIREBASE
================================ */

import { auth, db, googleProvider } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signInWithPopup,
  updateProfile,
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

const registerForm = document.getElementById("register-form");

const nameInput = document.getElementById("name");

const emailInput = document.getElementById("email");

const phoneInput = document.getElementById("phone");

const passwordInput = document.getElementById("password");

const confirmPasswordInput = document.getElementById("confirm-password");

const termsInput = document.getElementById("terms");

const googleRegisterButton = document.getElementById("google-register-button");

const submitButton = registerForm?.querySelector('button[type="submit"]');

const registerMessage = document.getElementById("register-message");

/* ==============================
   MENSAGENS
================================ */

function showMessage(message, type = "error") {
  if (!registerMessage) {
    window.alert(message);
    return;
  }

  registerMessage.textContent = message;
  registerMessage.hidden = false;

  registerMessage.classList.remove("is-error", "is-success");

  registerMessage.classList.add(type === "success" ? "is-success" : "is-error");
}

function clearMessage() {
  if (!registerMessage) {
    return;
  }

  registerMessage.textContent = "";
  registerMessage.hidden = true;

  registerMessage.classList.remove("is-error", "is-success");
}

/* ==============================
   ESTADO DE CARREGAMENTO
================================ */

function setLoading(isLoading) {
  if (submitButton) {
    submitButton.disabled = isLoading;

    submitButton.textContent = isLoading ? "Criando conta..." : "Registre-se";
  }

  if (googleRegisterButton) {
    googleRegisterButton.disabled = isLoading;

    googleRegisterButton.setAttribute("aria-busy", String(isLoading));
  }

  [
    nameInput,
    emailInput,
    phoneInput,
    passwordInput,
    confirmPasswordInput,
    termsInput,
  ].forEach((element) => {
    if (element) {
      element.disabled = isLoading;
    }
  });
}

/* ==============================
   TRATAMENTO DO CELULAR
================================ */

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidBrazilianPhone(phone) {
  const normalizedPhone = normalizePhone(phone);

  return normalizedPhone.length === 10 || normalizedPhone.length === 11;
}

/* ==============================
   DOCUMENTO DO USUÁRIO
================================ */

async function saveUserDocument(
  user,
  { name = "", phone = "", provider = "password" } = {},
) {
  const userReference = doc(db, "usuarios", user.uid);

  const userSnapshot = await getDoc(userReference);

  const userName = name.trim() || user.displayName || "Usuário Origo";

  const userData = {
    uid: user.uid,

    nome: userName,

    email: user.email?.toLowerCase() || "",

    celular: normalizePhone(phone),

    fotoURL: user.photoURL || "",

    provedor: provider,

    tcgFavorito: "",

    personagemFavorito: "",

    deckUtilizado: "",

    disponivel: false,

    cidade: "",

    atualizadoEm: serverTimestamp(),
  };

  if (!userSnapshot.exists()) {
    userData.criadoEm = serverTimestamp();
  }

  await setDoc(userReference, userData, {
    merge: true,
  });
}

/* ==============================
   VALIDAÇÃO DO FORMULÁRIO
================================ */

function validateRegistrationForm() {
  const name = nameInput?.value.trim() || "";

  const email = emailInput?.value.trim() || "";

  const phone = phoneInput?.value.trim() || "";

  const password = passwordInput?.value || "";

  const confirmPassword = confirmPasswordInput?.value || "";

  if (name.length < 2) {
    showMessage("Digite seu nome completo.");

    nameInput?.focus();
    return null;
  }

  if (!email) {
    showMessage("Digite seu endereço de e-mail.");

    emailInput?.focus();
    return null;
  }

  if (!isValidBrazilianPhone(phone)) {
    showMessage("Digite um celular válido com DDD.");

    phoneInput?.focus();
    return null;
  }

  if (password.length < 6) {
    showMessage("A senha precisa ter pelo menos 6 caracteres.");

    passwordInput?.focus();
    return null;
  }

  if (password !== confirmPassword) {
    showMessage("As senhas digitadas não são iguais.");

    confirmPasswordInput?.focus();
    return null;
  }

  if (!termsInput?.checked) {
    showMessage("Você precisa aceitar os Termos e Condições.");

    termsInput?.focus();
    return null;
  }

  return {
    name,
    email,
    phone,
    password,
  };
}

/* ==============================
   ERROS DO FIREBASE
================================ */

function getFirebaseErrorMessage(error) {
  const errorMessages = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",

    "auth/invalid-email": "O endereço de e-mail informado é inválido.",

    "auth/weak-password": "A senha informada é muito fraca.",

    "auth/network-request-failed":
      "Não foi possível conectar ao Firebase. Verifique sua internet.",

    "auth/popup-closed-by-user":
      "A janela do Google foi fechada antes da conclusão.",

    "auth/popup-blocked": "O navegador bloqueou a janela de login do Google.",

    "auth/cancelled-popup-request":
      "A solicitação de login com Google foi cancelada.",

    "auth/account-exists-with-different-credential":
      "Este e-mail já está associado a outra forma de login.",

    "auth/unauthorized-domain":
      "Este endereço ainda não está autorizado no Firebase Authentication.",

    "auth/operation-not-allowed":
      "Este método de cadastro ainda não está ativado no Firebase.",

    "permission-denied":
      "O Firebase bloqueou a gravação dos dados. Verifique as regras do Firestore.",
  };

  return (
    errorMessages[error?.code] ||
    "Não foi possível concluir o cadastro. Tente novamente."
  );
}

/* ==============================
   CADASTRO COM E-MAIL E SENHA
================================ */

registerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearMessage();

  const formData = validateRegistrationForm();

  if (!formData) {
    return;
  }

  setLoading(true);

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      formData.email,
      formData.password,
    );

    const user = userCredential.user;

    await updateProfile(user, {
      displayName: formData.name,
    });

    await saveUserDocument(user, {
      name: formData.name,
      phone: formData.phone,
      provider: "password",
    });

    showMessage("Conta criada com sucesso!", "success");

    window.setTimeout(() => {
      window.location.href = "principal.html";
    }, 700);
  } catch (error) {
    console.error("[Cadastro] Falha ao criar conta:", error);

    showMessage(getFirebaseErrorMessage(error));

    setLoading(false);
  }
});

/* ==============================
   CADASTRO COM GOOGLE
================================ */

googleRegisterButton?.addEventListener("click", async () => {
  clearMessage();

  if (!termsInput?.checked) {
    showMessage("Você precisa aceitar os Termos e Condições.");

    termsInput?.focus();
    return;
  }

  setLoading(true);

  try {
    const result = await signInWithPopup(auth, googleProvider);

    const user = result.user;

    const additionalUserInfo = getAdditionalUserInfo(result);

    const informedName = nameInput?.value.trim() || "";

    const informedPhone = phoneInput?.value.trim() || "";

    await saveUserDocument(user, {
      name: informedName || user.displayName || "",

      phone: informedPhone,

      provider: "google",
    });

    showMessage(
      additionalUserInfo?.isNewUser
        ? "Conta Google criada com sucesso!"
        : "Login com Google realizado com sucesso!",
      "success",
    );

    window.setTimeout(() => {
      window.location.href = "principal.html";
    }, 700);
  } catch (error) {
    console.error("[Cadastro Google] Falha:", error);

    showMessage(getFirebaseErrorMessage(error));

    setLoading(false);
  }
});
