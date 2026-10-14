import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const projectId = "origo-public-rules-test";
let testEnv;

const event = (active = true) => ({
  titulo: "Torneio Origo",
  categoria: "Pokémon",
  imagem: "assets/evento-1.jpg",
  local: "Loja Central",
  cidade: "Guarulhos",
  descricao: "Evento de teste do emulador.",
  formato: "Standard",
  latitude: -23.45,
  longitude: -46.53,
  dataHoraInicio: new Date("2027-01-01T12:00:00Z"),
  dataHoraFim: new Date("2027-01-01T18:00:00Z"),
  ativo: active,
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
});

const store = (active = true) => ({
  nome: "Loja Central",
  descricao: "Loja de cartas.",
  imagem: "assets/loja-1.jpg",
  endereco: "Rua Um, 10",
  bairro: "Centro",
  cidade: "Guarulhos",
  estado: "SP",
  cep: "",
  latitude: -23.45,
  longitude: -46.53,
  telefone: "",
  whatsapp: "",
  instagram: "",
  site: "",
  tcgs: ["Pokémon"],
  possuiMesas: true,
  realizaEventos: true,
  parceira: false,
  ativo: active,
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
});

const banner = () => ({
  imagem: "assets/banner-1.jpg",
  alt: "Destaque Origo",
  link: "principal.html",
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
});

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8085,
      rules,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "admins", "admin-1"), { ativo: true });
    await setDoc(doc(db, "eventos", "event-active"), {
      ...event(true),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
    await setDoc(doc(db, "eventos", "event-inactive"), {
      ...event(false),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
    await setDoc(doc(db, "lojas", "store-active"), {
      ...store(true),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
    await setDoc(doc(db, "lojas", "store-inactive"), {
      ...store(false),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
    await setDoc(doc(db, "banners", "banner-1"), {
      ...banner(),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
    await setDoc(doc(db, "usuarios", "player-1"), { uid: "player-1", email: "private@example.test" });
    await setDoc(doc(db, "perfisPublicos", "player-1"), {
      uid: "player-1",
      tipo: "player",
      ativo: true,
      nome: "Jogador público",
    });
    await setDoc(doc(db, "convites", "invite-1"), { remetenteId: "player-1", destinatarioId: "player-2" });
    await setDoc(doc(db, "conexoes", "connection-1"), { participantes: ["player-1", "player-2"] });
    await setDoc(doc(db, "partidas", "match-1"), { participantes: ["player-1", "player-2"] });
  });
});

test("visitor reads banners and queries only active events and stores", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const banners = await assertSucceeds(getDocs(collection(db, "banners")));
  const events = await assertSucceeds(getDocs(query(collection(db, "eventos"), where("ativo", "==", true))));
  const stores = await assertSucceeds(getDocs(query(collection(db, "lojas"), where("ativo", "==", true))));

  assert.equal(banners.size, 1);
  assert.deepEqual(events.docs.map((item) => item.id), ["event-active"]);
  assert.deepEqual(stores.docs.map((item) => item.id), ["store-active"]);
});

test("visitor cannot query inactive content or read private collections", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDocs(collection(db, "eventos")));
  await assertFails(getDoc(doc(db, "eventos", "event-inactive")));
  await assertFails(getDocs(collection(db, "lojas")));
  await assertFails(getDoc(doc(db, "lojas", "store-inactive")));

  for (const [name, id] of [
    ["usuarios", "player-1"],
    ["admins", "admin-1"],
    ["perfisPublicos", "player-1"],
    ["convites", "invite-1"],
    ["conexoes", "connection-1"],
    ["partidas", "match-1"],
  ]) {
    await assertFails(getDoc(doc(db, name, id)));
  }
});

test("visitor cannot create, update, or delete public content", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(db, "eventos", "visitor-event"), event()));
  await assertFails(updateDoc(doc(db, "eventos", "event-active"), { titulo: "Alterado" }));
  await assertFails(deleteDoc(doc(db, "banners", "banner-1")));
  await assertFails(setDoc(doc(db, "lojas", "visitor-store"), store()));
});

test("authenticated player reads public profiles but not another player's private document", async () => {
  const db = testEnv.authenticatedContext("player-2").firestore();
  await assertSucceeds(getDoc(doc(db, "perfisPublicos", "player-1")));
  await assertFails(getDoc(doc(db, "usuarios", "player-1")));
  await assertSucceeds(getDoc(doc(db, "usuarios", "player-2")));
});

test("authorized administrator retains public-content CRUD and inactive reads", async () => {
  const db = testEnv.authenticatedContext("admin-1").firestore();
  await assertSucceeds(getDoc(doc(db, "eventos", "event-inactive")));
  await assertSucceeds(getDoc(doc(db, "lojas", "store-inactive")));
  await assertSucceeds(setDoc(doc(db, "eventos", "event-admin"), event()));
  await assertSucceeds(setDoc(doc(db, "lojas", "store-admin"), store()));
  await assertSucceeds(setDoc(doc(db, "banners", "banner-admin"), banner()));
  await assertSucceeds(updateDoc(doc(db, "eventos", "event-active"), {
    titulo: "Torneio atualizado",
    atualizadoEm: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(db, "lojas", "store-active"), {
    nome: "Loja atualizada",
    atualizadoEm: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(db, "banners", "banner-1"), {
    alt: "Destaque atualizado",
    atualizadoEm: serverTimestamp(),
  }));
  await assertSucceeds(deleteDoc(doc(db, "eventos", "event-inactive")));
  await assertSucceeds(deleteDoc(doc(db, "lojas", "store-inactive")));
  await assertSucceeds(deleteDoc(doc(db, "banners", "banner-1")));
});

test("player cannot modify admin-only public collections", async () => {
  const db = testEnv.authenticatedContext("player-1").firestore();
  await assertFails(setDoc(doc(db, "banners", "player-banner"), banner()));
  await assertFails(updateDoc(doc(db, "lojas", "store-active"), { nome: "Alterada" }));
  await assertFails(deleteDoc(doc(db, "eventos", "event-active")));
});
