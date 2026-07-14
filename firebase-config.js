"use strict";

/* ==============================
   IMPORTAÇÕES DO FIREBASE
================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* ==============================
   CONFIGURAÇÃO DO PROJETO ORIGO
================================ */

const firebaseConfig = {
  apiKey: "AIzaSyDZFl7znE5N7As7_qwhwqx7p31hzf0FUe8",

  authDomain: "origo-fe2da.firebaseapp.com",

  projectId: "origo-fe2da",

  storageBucket: "origo-fe2da.firebasestorage.app",

  messagingSenderId: "372828227400",

  appId: "1:372828227400:web:bbbc84c69e02f35cf3d57d",
};

/* ==============================
   INICIALIZAÇÃO DO FIREBASE
================================ */

const app = initializeApp(firebaseConfig);

/* ==============================
   FIREBASE AUTHENTICATION
================================ */

const auth = getAuth(app);

/* ==============================
   LOGIN COM GOOGLE
================================ */

const googleProvider = new GoogleAuthProvider();

/*
  Exibe a seleção de contas do Google,
  mesmo quando já houver uma conta
  conectada no navegador.
*/

googleProvider.setCustomParameters({
  prompt: "select_account",
});

/* ==============================
   CLOUD FIRESTORE
================================ */

const db = getFirestore(app);

/* ==============================
   EXPORTAÇÕES
================================ */

export { app, auth, db, googleProvider };
