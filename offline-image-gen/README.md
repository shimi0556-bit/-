# offline-image-gen

A free, fully offline image generator for a weak Windows PC, installed on a USB stick, later to be tied to an Obsidian vault.

- **Engine:** [FastSD CPU](https://github.com/rupeshs/fastsdcpu) `v1.0.0-beta.510` in plain LCM mode (no GPU, little RAM).
- **Model:** SDXS-512 0.9 (one step, 512x512) with the TAESD tiny decoder. Mirrored in this repo's [`sdxs-models-v1`](https://github.com/shimi0556-bit/-/releases/tag/sdxs-models-v1) release by [`mirror-sdxs-models.yml`](../.github/workflows/mirror-sdxs-models.yml), because NetFree blocks Hugging Face downloads.

## Files

Copy these to `D:\AI\` (any folder works; everything stays inside it, so drive C does not fill up):

| File | What it does |
|---|---|
| `resume.ps1` | **Start here.** Runs `install-fastsd.ps1` while `get-model.ps1` downloads in the background, then makes a test image with `test-image.py`. Rerun to continue after a failure. Log: `resume.log`. |
| `install-fastsd.ps1` | Installs uv, Python 3.11, FastSD CPU and a reduced set of its packages (with pip, which writes less to a USB stick). Adds the Visual C++ runtime next to Python if Windows lacks it. Rerun to resume. Log: `install.log`. |
| `get-model.ps1` | Downloads the model from the GitHub release into `cache\hf\hub` and checks sha256. Only one copy runs at a time. Rerun to resume. Log: `get-model.log`. |
| `test-image.py` | Makes one image offline (`test-image.png`), prints the timing, and saves the settings the web UI starts with. |
| `start-fastsd.bat` | Double-click to start the web UI offline; the browser opens at http://127.0.0.1:7860 when it is ready. Close its window to stop it. |

Run a `.ps1` with `powershell -ExecutionPolicy Bypass -File <script>`.
