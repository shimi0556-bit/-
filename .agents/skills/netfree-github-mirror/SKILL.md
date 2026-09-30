---
name: netfree-github-mirror
description: Get files onto the user's own computer when their filtered internet (NetFree) or antivirus blocks the download — by mirroring the files into a GitHub Release of the user's repo with GitHub Actions and downloading from there, resumable and sha256-verified. Use whenever something the user installs or runs locally fails to download: "Blocked by NetFree", "(418)", "נטפרי", "נטפרי חוסם", "חסום", "ההורדה נחסמה", "לא מצליח להוריד", "ההתקנה נעצרה", "huggingface חסום", a Windows installer / PowerShell / pip / model download that dies with an empty or 418 error. Also use BEFORE writing any installer or download step meant for the user's computer, so it's built NetFree-proof from the start.
---

# netfree-github-mirror

The user's own PC is on **NetFree** (Israeli filtered internet). It answers blocked requests with
`HTTP 418 Blocked by NetFree` (in PowerShell 5.1 this can also surface as an *empty* WebException message), and
inspects HTTPS with its own root certificate. This cloud container is **not** filtered — only the user's PC is — so
something that downloads fine here can still fail there.

Proven fix (voice-studio, 2026-09-30): **copy the blocked files into a GitHub Release of the user's repo with a
GitHub Actions workflow, then download them from the release.** GitHub release downloads pass NetFree.

## What NetFree let through / blocked (user's PC, measured 2026-09-30)

| Source | Result |
|---|---|
| `raw.githubusercontent.com` — text files | OK |
| `raw.githubusercontent.com` — binary files (.whl, .wav) | **blocked** |
| GitHub release assets (`github.com/<o>/<r>/releases/download/...`) | OK (uv zip, and the voice-models release) |
| `github.com` pages, git smart-HTTP (`.git/info/refs`) | OK |
| `pypi.org` index + `files.pythonhosted.org` wheels | OK |
| `huggingface.co` — pages | OK |
| `huggingface.co` — file downloads (`/resolve/...`, CDN `*.hf.co`) | **blocked** |

Re-check rather than trust this table forever: probe first (step 4).

## Recipe

1. **Mirror with a workflow.** Copy `mirror-release.yml` from this skill to `.github/workflows/mirror-<tag>.yml`, set
   `TAG`, `TITLE`, the `FILES` list (`<asset-name> <url>` per line — pin versions/commits in the URLs) and the file's
   own path under `on.push.paths`. Commit and push: the push of that file runs it on any branch (`workflow_dispatch`
   only works once the file is on the default branch). It downloads on a GitHub runner, splits files > 500 MB
   (release assets must be < 2 GiB), writes `manifest.txt` (`name size sha256 part,part,...`) and publishes the
   release. Watch it with `mcp__github__actions_list` (`list_workflow_runs`) — ~2 min for 3.5 GB.
   - Why Actions: this session can't create releases directly (the GitHub MCP tools have no create-release, and the
     proxy blocks the REST API), and git pushes reject files > 100 MB.
   - Check licenses before mirroring and credit them in the release notes.
   - Verify the mirror: compare the manifest's sha256 with the originals.
2. **Download on the user's PC** with `download-release.ps1` (or reuse its logic inside an installer): curl.exe with
   resume (`-C -`), IWR fallback, parts kept until the joined file's sha256 matches, then placed in the target
   folder. Re-running resumes. Windows PowerShell 5.1 compatible, ASCII-only.
3. **Small binaries from the repo itself** (a wheel, a few .wav): raw binary is blocked but raw text isn't → keep a
   base64 text copy next to each (`base64 -w 76 f > f.b64`), download that and decode when the binary fails.
4. **Probe before installing**: read 2 KB (`WebRequest.AddRange(0,2047)`) from every host the install needs, print
   OK/BLOCKED per host, stop before writing anything if something with no alternative is blocked, and name the
   sites to ask NetFree to open. If the probe message contains `NetFree`, say so.
5. **Pin repo downloads to a commit**, not the branch: raw.githubusercontent caches branch URLs ~5 min per edge, so
   right after a push the user can get stale/mixed files. Resolve the branch with
   `https://github.com/<o>/<r>.git/info/refs?service=git-upload-pack` (regex `([0-9a-f]{40}) refs/heads/<branch>\n`)
   and use `raw.githubusercontent.com/<o>/<r>/<sha>/...`.
6. **Trust the Windows certificate store** (NetFree inspects HTTPS): `UV_SYSTEM_CERTS=1` for uv,
   `truststore.inject_into_ssl()` in Python; PowerShell/curl.exe already use the Windows store.
7. **Hunt hidden downloads.** Libraries fetch files on their own (e.g. `dicta_onnx` called
   `Tokenizer.from_pretrained(...)` on every start; Chatterbox's tokenizer calls `hf_hub_download` for Cangjie).
   Test offline-from-HF with `netfree418.py` (a local server that answers everything with 418):
   `python netfree418.py &` then run with `HF_ENDPOINT=http://127.0.0.1:8418 HF_HOME=<empty dir>`.
   Everything the app needs must come from local files; add any stragglers to the mirror.
8. **Simulate the user's PC before telling them to run it**: PowerShell 7 runs on Linux
   (`github.com/PowerShell/PowerShell/releases` tarball); point the blocked URLs at `netfree418.py`, run the real
   installer end to end with a fake `$HOME`, then use the result with HF blocked. Lint for 5.1 with PSScriptAnalyzer
   (`PSUseCompatibleSyntax/Commands/Types`, profile `win-48_x64_10.0.17763.0_5.1.17763.316_x64_4.0.30319.42000_framework`).

## Dead ends (don't retry)

- **jsDelivr** (`cdn.jsdelivr.net/gh/...`) as a mirror: 403 for repos over 50 MB ("Package size exceeded") on some
  files, and it caches branch→commit for hours (a path purge doesn't refresh it).
- Committing big files to git: > 100 MB rejected, and it bloats every clone forever.
- Telling the user to "ask NetFree to open huggingface.co": the pages already open; it's the file downloads that are
  blocked, and it depends on NetFree. Mirror first; offer the request as a second option.

## PowerShell gotchas that bit us

- `Get-Command curl.exe` / `uv` can return several matches (Git for Windows adds its own curl.exe) → `| Select-Object -First 1`.
- Windows PowerShell 5.1: no `&&`; `.ps1` files without BOM are read as ANSI (keep them ASCII); running a `.ps1`
  file is blocked by the default execution policy (use `powershell -ExecutionPolicy Bypass -File`), but `irm | iex`
  isn't; native stderr with `$ErrorActionPreference='Stop'` only errors when redirected; check `$LASTEXITCODE`.
- Tell the user where to paste: once they pasted the command into a game's log console that ignores input.

## Reference implementation

`voice-studio/` in this repo: `.github/workflows/voice-models-release.yml` (release `voice-models-v1`),
`voice-studio/setup.ps1` step 5, `voice-studio/install-windows.ps1` (probe, .b64 fallback, commit pinning), and
`wiki/voice-studio.md` (the full story).
