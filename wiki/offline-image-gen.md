# offline-image-gen

Free, fully offline image generator for the owner's weak Windows PC (Intel N150, 7.6GB RAM, no GPU), later to be tied to an Obsidian vault. See [`offline-image-gen/README.md`](../offline-image-gen/README.md) for the files.

- **Engine:** FastSD CPU `v1.0.0-beta.510`, plain LCM mode (not OpenVINO), 512x512, one step.
- **Model:** `rupeshs/sdxs-512-0.9-orig-vae` + `madebyollin/taesd` (tiny decoder). FastSD loads them with `local_files_only` when "use offline model" is on, so `HF_HUB_OFFLINE=1` plus a Hugging Face cache layout (`hub/models--org--name/snapshots/<commit>/...` and `refs/main`) is enough.
- **Install folder:** every script uses its own folder as the root (`$AI`), so the whole setup can live anywhere (a USB stick, `C:\AI`, ...).

## Notes

- **NetFree** (the PC's filtered internet) blocks Hugging Face and ModelScope model files with HTTP 418 and breaks PyPI's index page for `mcp`. Fixes: the model files are mirrored into the `sdxs-models-v1` release by `.github/workflows/mirror-sdxs-models.yml` (do not touch that file: any push of it re-runs the workflow and re-uploads 3GB), and `install-fastsd.ps1` leaves `mcp`/`fastapi-mcp` out (only FastSD's `--mcp` mode uses them).
- **TLS interception:** `uv` needs `UV_SYSTEM_CERTS=1`; Python's `requests` needs the `cache\ca-bundle.pem` the installer builds.
- **USB stick trouble (2026-10-08):** the first target, a 58GB FAT32 "Generic Flash Disk", threw `disk 51` paging errors and "Delayed Write Failed" twice while `uv` wrote thousands of small package files, and dropped off the system. A read-only `chkdsk` then showed hundreds of garbage root entries (dates like 2091), so the stick itself is failing or counterfeit. The owner replaced it with a SanDisk Cruzer Blade (58GB FAT32, also `D:`), which tested clean: ~2.7MB/s sequential writes but ~0.2s per small file.
- **Write-light install (because of the above):** `install-fastsd.ps1` installs packages with `pip --no-compile` instead of `uv` (uv unpacks every file into its cache and then copies it, doubling the small-file writes), and drops packages FastSD's default web UI never imports (`mcp`, `fastapi-mcp`, `PyQt5`, `onnx`, `omegaconf`, `mediapipe`, `tomesd`, `hf_xet`). The reduced set was checked on Linux: the web UI starts and `test-image.py` makes an image offline. `torch==2.8.0` and `torchvision==0.23.0` are pinned together; an unpinned torchvision pulls a newer torch.
- **Memory:** the PC has almost no free RAM at idle; the fp32 model needs ~3GB, so free memory (close apps) before generating.
