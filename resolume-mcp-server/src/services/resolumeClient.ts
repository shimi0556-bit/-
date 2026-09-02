import axios, { AxiosError, type AxiosInstance } from "axios";
import { API_PREFIX, DEFAULT_HOST, DEFAULT_PORT } from "../constants.js";
import type { HttpMethod } from "../types.js";

function normalizePath(path: string): string {
  let p = path.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.startsWith(API_PREFIX)) p = `${API_PREFIX}${p}`;
  return p;
}

class ResolumeClient {
  private http: AxiosInstance;
  readonly baseURL: string;

  constructor() {
    this.baseURL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: { Accept: "application/json" },
      // Resolume returns non-JSON (e.g. jpeg thumbnails) from some endpoints.
      validateStatus: (status) => status >= 200 && status < 300,
    });
  }

  /** Low-level request against an arbitrary path. Path is auto-prefixed with /api/v1 if missing. */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    opts?: { responseType?: "json" | "arraybuffer" }
  ): Promise<T> {
    const url = normalizePath(path);
    const response = await this.http.request<T>({
      method,
      url,
      data: body,
      responseType: opts?.responseType === "arraybuffer" ? "arraybuffer" : "json",
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
    });
    return response.data;
  }

  /** Convenience GET under /composition/<subPath>. */
  async getComposition<T = unknown>(subPath = ""): Promise<T> {
    const path = subPath ? `composition/${subPath.replace(/^\/+/, "")}` : "composition";
    return this.request<T>("GET", path);
  }

  /** Convenience PUT under /composition/<subPath>. */
  async putComposition<T = unknown>(subPath: string, body: unknown): Promise<T> {
    const path = `composition/${subPath.replace(/^\/+/, "")}`;
    return this.request<T>("PUT", path, body);
  }
}

export const resolumeClient = new ResolumeClient();

export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError;
    if (err.code === "ECONNREFUSED" || err.code === "ECONNABORTED" || !err.response) {
      return (
        `Error: Could not reach Resolume at ${resolumeClient.baseURL}${API_PREFIX}. ` +
        `Make sure Resolume Arena or Avenue is running and that Preferences -> Webserver -> ` +
        `"Enable REST API" (sometimes labeled "Enable Webserver") is turned on, and that host/port ` +
        `match the RESOLUME_HOST/RESOLUME_PORT environment variables (default 127.0.0.1:8080).`
      );
    }
    const status = err.response.status;
    const data = err.response.data;
    const detail =
      typeof data === "string"
        ? data
        : data
        ? JSON.stringify(data)
        : err.message;
    switch (status) {
      case 404:
        return (
          `Error: 404 Not Found. The layer/clip/column/path index or id doesn't exist in the ` +
          `current composition, or the path is wrong for this Resolume version. ` +
          `Call resolume_get_composition first to inspect the live structure. Detail: ${detail}`
        );
      case 400:
        return `Error: 400 Bad Request - Resolume rejected the request body or parameters. Detail: ${detail}`;
      case 409:
        return `Error: 409 Conflict - the operation isn't valid in the current state. Detail: ${detail}`;
      default:
        return `Error: Resolume REST API returned status ${status}. Detail: ${detail}`;
    }
  }
  return `Error: Unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`;
}
