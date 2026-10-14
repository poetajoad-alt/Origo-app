const AUTH_DESTINATIONS = new Set([
  "principal.html",
  "mapa.html",
  "meu-perfil.html",
  "conexoes.html",
  "partida-online.html",
  "admin-eventos.html",
]);

const DEFAULT_DESTINATION = "principal.html";

export function sanitizeAuthDestination(value, origin = "https://origo.invalid") {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_DESTINATION;
  }

  try {
    const target = new URL(value, `${origin}/`);
    if (target.origin !== origin || target.username || target.password) {
      return DEFAULT_DESTINATION;
    }

    const fileName = target.pathname.split("/").filter(Boolean).at(-1) || "";
    if (!AUTH_DESTINATIONS.has(fileName)) {
      return DEFAULT_DESTINATION;
    }

    return `${fileName}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_DESTINATION;
  }
}

export function getAuthDestination(search, origin = "https://origo.invalid") {
  const parameters = new URLSearchParams(search || "");
  return sanitizeAuthDestination(parameters.get("redirect"), origin);
}

export function buildAuthEntryUrl(page, destination, origin = "https://origo.invalid") {
  const safePage = page === "registre-se.html" ? page : "login.html";
  const safeDestination = sanitizeAuthDestination(destination, origin);
  return `${safePage}?redirect=${encodeURIComponent(safeDestination)}`;
}
