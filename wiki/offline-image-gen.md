# offline-image-gen

Free, fully offline image generator for the owner's weak Windows PC (Intel N150, 7.6GB RAM, no GPU), later to be tied to an Obsidian vault. See [`offline-image-gen/README.md`](../offline-image-gen/README.md) for the files.

- **Engine:** FastSD CPU `v1.0.0-beta.510`, plain LCM mode (not OpenVINO), 512x512, one step.
- **Model:** `rupeshs/sdxs-512-0.9-orig-vae` + `madebyollin/taesd` (tiny decoder). FastSD loads them with `local_files_only` when "use offline model" is on, so `HF_HUB_OFFLINE=1` plus a Hugging Face cache layout (`hub/models--org--name/snapshots/<commit>/...` and `refs/main`) is enough.
- **Install folder:** every script uses its own folder as the root (`$AI`), so the whole setup can live anywhere (a USB stick, `C:\AI`, ...).

## Notes

- **NetFree** (the PC's filtered internet) blocks Hugging Face and ModelScope model files with HTTP 418 and breaks PyPI's index page for `mcp`. Fixes: the model files are mirrored into the `sdxs-models-v1` release by `.github/workflows/mirror-sdxs-models.yml` (do not touch that file: any push of it re-runs the workflow and re-uploads 3GB), and `install-fastsd.ps1` leaves `mcp`/`fastapi-mcp` out (only FastSD's `--mcp` mode uses them).
- **TLS interception:** `uv` needs `UV_SYSTEM_CERTS=1`; Python's `requests` needs the `cache\ca-bundle.pem` the installer builds.
- **USB stick trouble (2026-10-08):** the first target, a 58GB FAT32 "Generic Flash Disk", threw `disk 51` paging errors and "Delayed Write Failed" twice while `uv` wrote thousands of small package files, and dropped off the system. Large sequential downloads (the 590MB torch wheel) went fine. Open: move the install to the internal drive (needs free space there) or a better drive.
- **Memory:** the PC has almost no free RAM at idle; the fp32 model needs ~3GB, so free memory (close apps) before generating.
