# dalle-mcp-server

An MCP (Model Context Protocol) server for generating, editing and varying images through OpenAI's Images API — the API behind DALL·E, and its current successor **gpt-image-1**.

> **Note on model names:** OpenAI's image models have moved on from `dall-e-2`/`dall-e-3` to `gpt-image-1` (and newer). This server defaults to `gpt-image-1` but still accepts `"dall-e-3"` / `"dall-e-2"` in the `model` argument for accounts where those remain available — if OpenAI has since disabled a legacy model for your account, the API's own error message will say so.

## Prerequisites

- An OpenAI API key with access to image generation: https://platform.openai.com/api-keys
- Node.js 18+

## Install & build

```bash
cd dalle-mcp-server
npm install
npm run build
```

## Configure

| Variable             | Required | Description                                                        |
|-----------------------|----------|----------------------------------------------------------------------|
| `OPENAI_API_KEY`      | yes      | Your OpenAI API key                                                  |
| `OPENAI_BASE_URL`     | no       | Override the API base URL (default `https://api.openai.com/v1`)      |
| `OPENAI_ORGANIZATION` | no       | Sets the `OpenAI-Organization` header, for multi-org accounts        |
| `OPENAI_PROJECT`      | no       | Sets the `OpenAI-Project` header                                     |

### Example MCP client config

```json
{
  "mcpServers": {
    "dalle": {
      "command": "node",
      "args": ["/absolute/path/to/dalle-mcp-server/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

## Tools

- **`dalle_generate_image`** — generate image(s) from a text prompt. Supports `model`, `n`, `size`, `quality`, `background` (transparent PNG/WebP), `output_format`, `moderation`, `style` (dall-e-3), and either returns the image inline or writes it to `save_dir`.
- **`dalle_edit_image`** — edit an existing image with a prompt: mask-based inpainting (any model), or (gpt-image-1) combine up to 16 reference images into one new image.
- **`dalle_create_image_variation`** — generate prompt-less variations of an image. **dall-e-2 only**; if your account no longer has dall-e-2 access, use `dalle_edit_image` with `gpt-image-1` for a prompt-guided remix instead.

Every tool that returns an image includes it inline (viewable directly) and, if `save_dir` was given, also writes it to disk and reports the file path(s).

## Development

```bash
npm run dev    # tsx watch, runs src/index.ts directly
npm run build  # compile to dist/
npm start      # run compiled dist/index.js
```

## Testing with MCP Inspector

```bash
export OPENAI_API_KEY=sk-...
npx @modelcontextprotocol/inspector node dist/index.js
```
