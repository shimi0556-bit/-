# resolume-mcp-server

An MCP (Model Context Protocol) server that lets an LLM control [Resolume](https://resolume.com/) Arena or Avenue — the VJ / live video mixing software — over its built-in local REST API.

It runs as a local stdio MCP server: it talks to Resolume over plain HTTP on the same machine (or LAN), the same way Resolume's own web-based clip grid does.

## Prerequisites

1. Resolume Arena or Avenue 7+ running on a machine reachable from wherever this server runs.
2. In Resolume: **Preferences → Webserver → Enable REST API** (the exact label can vary slightly by version — look for the webserver/REST API toggle, and note the port, default `8080`).
3. Node.js 18+.

## Install & build

```bash
cd resolume-mcp-server
npm install
npm run build
```

## Configure

Environment variables (all optional):

| Variable        | Default     | Description                              |
|-----------------|-------------|-------------------------------------------|
| `RESOLUME_HOST` | `127.0.0.1` | Host/IP where Resolume's webserver runs   |
| `RESOLUME_PORT` | `8080`      | Port Resolume's webserver listens on      |

### Example MCP client config

```json
{
  "mcpServers": {
    "resolume": {
      "command": "node",
      "args": ["/absolute/path/to/resolume-mcp-server/dist/index.js"],
      "env": {
        "RESOLUME_HOST": "127.0.0.1",
        "RESOLUME_PORT": "8080"
      }
    }
  }
}
```

## What it covers

Resolume's REST API mirrors its entire live composition as one large, addressable JSON tree (layers → clips, columns, layer groups, decks, and every parameter — opacity, transport, effects, tempo, master — down to individual values). This server pairs two layers of tools:

**Structural / workflow tools** for the operations a VJ actually performs, backed by endpoints confirmed from Resolume's own documentation:
- Composition: `resolume_get_product`, `resolume_get_composition`, `resolume_new_composition`, `resolume_open_composition`, `resolume_save_composition`, `resolume_stop_all` (blackout)
- Layers: `resolume_list_layers`, `resolume_get_layer`, `resolume_add_layer`, `resolume_clear_layer`
- Clips: `resolume_list_clips`, `resolume_get_clip`, `resolume_trigger_clip`, `resolume_clear_clip`, `resolume_open_clip_file`, `resolume_get_clip_thumbnail`
- Columns (scenes): `resolume_list_columns`, `resolume_trigger_column`
- Decks: `resolume_list_decks`, `resolume_open_deck`

**Generic parameter tools** for everything else in the tree (opacity, clip transport position/speed, tempo/BPM, master crossfader, effect parameters, ...) that would otherwise need one dedicated tool per property:
- `resolume_get_value` / `resolume_set_value` — read/write any path under `/composition`, e.g. `layers/2/video/opacity`
- `resolume_raw_request` — full escape hatch for any REST path/method (e.g. composition-level actions outside `/composition/*`)
- `resolume_get_openapi_spec_hint` — points at Resolume's own live, version-accurate interactive API docs (served by Resolume itself at `http://<host>:<port>/api/docs/rest/`), useful if a path returns 404 on a given Resolume version

### Why generic tools for parameters

Resolume's exact parameter paths/shapes can shift slightly between versions, and the REST API is explicitly designed so *any* value in the composition tree is reachable by path. Rather than guessing at every property name (`video.opacity`, `transport.position`, `tempocontroller.tempo`, ...) and risking a wrong or version-specific tool, the agent is expected to call `resolume_get_composition` (optionally scoped with `sub_path`) to discover the live shape, then read/write it with `resolume_get_value` / `resolume_set_value`. This keeps the server correct across Resolume versions instead of hard-coding paths that could be wrong for your install.

## Development

```bash
npm run dev    # tsx watch, runs src/index.ts directly
npm run build  # compile to dist/
npm start      # run compiled dist/index.js
```

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
