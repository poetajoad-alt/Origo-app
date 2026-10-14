const MAP_COLLECTIONS = ["perfisPublicos", "lojas", "eventos"];

export function createMapCollectionLoaders({
  db,
  collection,
  getDocs,
  query,
  where,
  waitForAuth = () => Promise.resolve(),
  includePlayers = true,
}) {
  const collectionNames = includePlayers
    ? MAP_COLLECTIONS
    : MAP_COLLECTIONS.filter((name) => name !== "perfisPublicos");

  return Object.fromEntries(collectionNames.map((name) => [name, async () => {
    if (name === "perfisPublicos") await waitForAuth();
    const result = await getDocs(query(collection(db, name), where("ativo", "==", true)));
    return result.docs;
  }]));
}

// A escolha de aparecer no mapa também não inclui o marcador do próprio jogador.
export function filterMapPointsForViewer(points = [], viewerUid = "") {
  if (!viewerUid) return points;
  return points.filter((point) => point.type !== "player" || point.id !== viewerUid);
}

export function normalizeCoordinates(data = {}) {
  const read = (value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return Number(value);
    return NaN;
  };
  const latitude = read(data.latitude);
  const longitude = read(data.longitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) return null;
  return { latitude, longitude };
}

export function isPublicProfileVisible(data = {}) {
  return data.tipo === "player" && data.ativo === true;
}

export function isActiveEntity(data = {}) {
  return data.ativo === true;
}

function toDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

export function isEventCurrent(data = {}, now = new Date()) {
  if (!isActiveEntity(data)) return false;
  const end = toDate(data.dataHoraFim);
  if (end) return end.getTime() >= now.getTime();
  const start = toDate(data.dataHoraInicio) || toDate(data.data);
  if (!start) return true; // Legacy event without a parseable date: activity flag remains source of truth.
  if (data.dataHoraInicio && !data.dataHoraFim) return start.getTime() >= now.getTime();
  const endOfStartDay = new Date(start);
  endOfStartDay.setHours(23, 59, 59, 999);
  return endOfStartDay.getTime() >= now.getTime();
}

function snapshotData(snapshot) {
  return typeof snapshot?.data === "function" ? snapshot.data() || {} : snapshot || {};
}

export function normalizeMapPoint(type, snapshot, now = new Date()) {
  const data = snapshotData(snapshot);
  const coordinates = normalizeCoordinates(data);
  if (!coordinates) return null;
  if (type === "player" && !isPublicProfileVisible(data)) return null;
  if (type === "store" && (!isActiveEntity(data) || typeof data.nome !== "string" || !data.nome.trim())) return null;
  if (type === "event" && (!isEventCurrent(data, now) || typeof data.titulo !== "string" || !data.titulo.trim())) return null;
  if (!["player", "store", "event"].includes(type)) return null;
  return {
    id: snapshot?.id || data.uid || "",
    type,
    name: type === "player" ? (typeof data.nome === "string" && data.nome.trim() ? data.nome.trim() : "Jogador Origo") :
      type === "store" ? data.nome.trim() : data.titulo.trim(),
    ...coordinates,
    available: type === "player" && data.disponivel === true,
    online: false,
    presenceState: type === "player" ? "unknown" : null,
  };
}

export async function loadMapCollections(loaders, now = new Date()) {
  const collectionNames = MAP_COLLECTIONS.filter((name) => typeof loaders[name] === "function");
  const entries = await Promise.all(collectionNames.map(async (collectionName) => {
    const type = collectionName === "perfisPublicos" ? "player" : collectionName === "lojas" ? "store" : "event";
    try {
      const docs = await loaders[collectionName]();
      const points = (Array.isArray(docs) ? docs : docs?.docs || [])
        .map((doc) => normalizeMapPoint(type, doc, now))
        .filter(Boolean);
      return [collectionName, { status: points.length ? "loaded" : "empty", points, error: null }];
    } catch (error) {
      return [collectionName, { status: "error", points: [], error }];
    }
  }));
  const collections = Object.fromEntries(entries);
  const points = collectionNames.flatMap((name) => collections[name].points);
  const errors = collectionNames.filter((name) => collections[name].status === "error");
  return {
    collections,
    omittedCollections: MAP_COLLECTIONS.filter((name) => !collectionNames.includes(name)),
    points,
    hasErrors: errors.length > 0,
    allFailed: collectionNames.length > 0 && errors.length === collectionNames.length,
    hasPoints: points.length > 0,
  };
}

