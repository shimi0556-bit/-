# github-ai-tracker

A small always-on service that tracks a list of GitHub usernames you control and
narrates their public activity (pushes, PRs, issues, releases, stars...) through
an "AI expert" lens — each new event gets a one/two-sentence technical insight
from Claude, so a feed of raw events turns into something readable.

You drive it however you like: a REST API plus a minimal dashboard to add/remove
tracked users, browse the activity feed, and trigger a manual poll — there's no
fixed "this is what tracking means", you decide who to watch and what to do with
the feed (dashboard, webhook, or poll the API yourself).

## How it works

- Every `POLL_INTERVAL_MINUTES` (default 10), it calls GitHub's public
  [Events API](https://docs.github.com/en/rest/activity/events) for each tracked
  user and finds events newer than the last poll.
- Each new event is turned into a plain-English headline (`src/github.js`).
- If `ANTHROPIC_API_KEY` is set, Claude annotates it with a short "why an AI
  practitioner would care" insight (`src/ai.js`). Without a key, raw events are
  still logged, just without commentary.
- If `WEBHOOK_URL` is set, each new event is also POSTed there (Slack/Discord
  incoming-webhook compatible — includes a `text` field).
- State (tracked users + recent activity, capped at 500 entries) is persisted to
  `data/state.json`.

## Run locally

```bash
cd github-ai-tracker
cp .env.example .env   # fill in what you want
npm install
npm start
```

Open http://localhost:3000 for the dashboard.

## API

| Method | Path                     | Auth        | Body / query                  |
|--------|--------------------------|-------------|--------------------------------|
| GET    | `/api/watch`             | none        | —                               |
| POST   | `/api/watch`              | `X-API-Key` | `{ "username": "octocat" }`    |
| DELETE | `/api/watch/:username`    | `X-API-Key` | —                               |
| GET    | `/api/activity`           | none        | `?username=&limit=`            |
| POST   | `/api/poll`               | `X-API-Key` | — (triggers an immediate poll) |
| GET    | `/healthz`                 | none        | —                               |

`X-API-Key` is only enforced when the `API_KEY` env var is set — leave it unset
for local/dev use.

## Deploy to Render

You need a [Render](https://render.com) API key or account already connected to
this GitHub repo.

**Option A — Blueprint (recommended, no CLI needed):**
1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the Render dashboard: **New +** → **Blueprint** → pick this repo. Render
   reads `render.yaml` and creates the web service.
3. Fill in the secret env vars it prompts for: `GITHUB_TOKEN`,
   `ANTHROPIC_API_KEY`, `API_KEY`, `WEBHOOK_URL` (all optional except you'll
   want at least `GITHUB_TOKEN` to avoid the 60 req/hour anonymous rate limit).

**Option B — Render CLI, using your API key:**
```bash
# on your own machine, with your Render API key exported (never paste it in chat)
export RENDER_API_KEY=rnd_xxx
render blueprint launch   # from inside github-ai-tracker/
```

**Note on persistence:** Render's free web services do not guarantee a
persistent disk across deploys/restarts — `data/state.json` may reset. For
durable history, attach a [Render Disk](https://render.com/docs/disks) mounted
at a path and set `DATA_DIR` to it, or swap `src/store.js` for a real database.

## Environment variables

See `.env.example` for the full list and defaults.
