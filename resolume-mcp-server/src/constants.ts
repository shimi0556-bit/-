// Resolume Arena/Avenue exposes its REST API under this fixed prefix,
// regardless of host/port (Preferences -> Webserver -> Enable REST API).
export const API_PREFIX = "/api/v1";

export const DEFAULT_HOST = process.env.RESOLUME_HOST || "127.0.0.1";
export const DEFAULT_PORT = process.env.RESOLUME_PORT || "8080";

// Cap how much text a single tool response can contain so a large
// composition tree doesn't blow out the agent's context window.
export const CHARACTER_LIMIT = 25000;
