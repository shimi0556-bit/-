import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolumeClient, handleApiError } from "../services/resolumeClient.js";
import { jsonResult, errorResult, textResult } from "../services/format.js";
import { HttpMethodSchema } from "../schemas/common.js";

export function registerMetaTools(server: McpServer): void {
  server.registerTool(
    "resolume_get_product",
    {
      title: "Get Resolume Product Info",
      description: `Get the name and version of the running Resolume application (Arena or Avenue).

Use this first to confirm the MCP server can actually reach Resolume before trying other tools.

Returns: { "name": string, "version"?: string, "major"?: number, "minor"?: number, ... }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await resolumeClient.request("GET", "/product");
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_get_composition",
    {
      title: "Get Composition Tree",
      description: `Get the full (or a scoped slice of the) live composition tree: layers, clips, columns, layer groups, decks and their current parameter values.

This is the primary discovery tool: Resolume's parameter tree is large and can vary slightly between versions, so call this (optionally with 'sub_path' to scope down to e.g. "layers/2" or "layers/2/clips/3/video/opacity") before using resolume_get_value/resolume_set_value on a path you haven't confirmed exists.

Args:
  - sub_path (string, optional): path segment(s) under /composition to scope the result to, e.g. "layers/2/clips/3" or "columns". Omit for the entire composition (can be large; the response is truncated at the character limit if so - narrow with sub_path if you hit that).

Returns: the raw JSON object/value found at /composition/<sub_path>.`,
      inputSchema: {
        sub_path: z
          .string()
          .optional()
          .describe('Optional path under /composition, e.g. "layers/2" or "layers/2/clips/3/video/opacity".'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ sub_path }: { sub_path?: string }) => {
      try {
        const data = await resolumeClient.getComposition(sub_path ?? "");
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_get_value",
    {
      title: "Get a Composition Parameter Value",
      description: `Read any single value or object from inside the live composition tree, by path.

Every control in Resolume (opacity, clip transport position, effect parameters, master crossfader, tempo, ...) lives somewhere under /composition and can be read this way. If you don't know the exact path, call resolume_get_composition first to find it (parameters typically look like { "value": ..., "valuetype": ..., "min": ..., "max": ... }).

Args:
  - path (string, required): path under /composition, e.g. "layers/2/video/opacity" or "tempocontroller/tempo".

Returns: whatever JSON value/object Resolume has at that path.`,
      inputSchema: {
        path: z.string().min(1).describe('Path under /composition, e.g. "layers/2/video/opacity".'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ path }: { path: string }) => {
      try {
        const data = await resolumeClient.getComposition(path);
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_set_value",
    {
      title: "Set a Composition Parameter Value",
      description: `Set any parameter inside the live composition tree, by path. This is how you change things Resolume doesn't have a dedicated tool for here: opacity, clip transport position/speed, master crossfader/dashboard, tempo, effect parameters, layer/clip/column names, etc.

Most Resolume parameters are objects shaped like { "value": ... }, so the request body is usually { "value": <new value> }. Use resolume_get_value on the same path first if you're unsure of the expected shape or value range (min/max).

Args:
  - path (string, required): path under /composition, e.g. "layers/2/video/opacity" or "tempocontroller/tempo".
  - body (object, required): JSON body to PUT, typically { "value": <number|string|boolean> }.

Returns: Resolume's response body (often empty or the updated object).`,
      inputSchema: {
        path: z.string().min(1).describe('Path under /composition, e.g. "layers/2/video/opacity".'),
        body: z
          .record(z.unknown())
          .describe('JSON body to PUT, typically { "value": <new value> }.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ path, body }: { path: string; body: Record<string, unknown> }) => {
      try {
        const data = await resolumeClient.putComposition(path, body);
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_raw_request",
    {
      title: "Raw Resolume REST Request",
      description: `Escape hatch: send an arbitrary request to Resolume's REST API for endpoints not covered by a dedicated tool (e.g. "/composition/new", "/composition/save", "/composition/open", "/effects", "/sources", "/files", "/advancedoutput/...").

The path is automatically prefixed with "/api/v1" if you omit it. Prefer the dedicated tools (resolume_list_clips, resolume_trigger_clip, resolume_get_value, ...) when one exists; use this when you need an endpoint this server doesn't wrap yet.

Args:
  - method ("GET"|"PUT"|"POST"|"DELETE"|"PATCH", required)
  - path (string, required): e.g. "/composition/save" or "composition/new".
  - body (object, optional): JSON body for PUT/POST requests.

Returns: the raw JSON response body from Resolume.`,
      inputSchema: {
        method: HttpMethodSchema,
        path: z.string().min(1).describe('Request path, e.g. "/composition/save".'),
        body: z.record(z.unknown()).optional().describe("Optional JSON body for PUT/POST/PATCH."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({
      method,
      path,
      body,
    }: {
      method: "GET" | "PUT" | "POST" | "DELETE" | "PATCH";
      path: string;
      body?: Record<string, unknown>;
    }) => {
      try {
        const data = await resolumeClient.request(method, path, body);
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_get_openapi_spec_hint",
    {
      title: "Where To Find The Live OpenAPI Spec",
      description: `Resolume serves its own interactive, version-accurate REST API docs directly from the running application (Preferences -> Webserver -> Enable REST API, then open a browser). This tool doesn't fetch anything itself (the MCP server may not have a display/browser) - it just returns the URL(s) to check when a path used by another tool 404s and you want ground truth for the exact Resolume version in use.

Returns: text with the docs URL for the currently configured host/port.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      return textResult(
        `Open this in a browser on the machine running Resolume to see the exact REST API for the installed version:\n` +
          `  ${resolumeClient.baseURL}/api/docs/rest/\n\n` +
          `The composition JSON schema itself can also be inspected live at:\n` +
          `  ${resolumeClient.baseURL}/api/v1/composition`
      );
    }
  );
}
