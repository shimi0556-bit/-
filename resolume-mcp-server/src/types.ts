/**
 * Resolume's composition tree is a large, version-dependent JSON document
 * (its exact shape can differ slightly between Resolume versions). We only
 * strongly type the handful of fields tools rely on directly, and otherwise
 * pass the tree through as loosely-typed JSON so the server keeps working
 * against composition shapes it doesn't know about in advance.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export interface ResolumeProduct {
  name?: string;
  version?: string;
  major?: number;
  minor?: number;
  micro?: number;
  build?: number;
  [key: string]: JsonValue | undefined;
}

export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH";
