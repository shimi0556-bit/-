#!/usr/bin/env bash
# install-logan.sh - ONE command install for Logan CLI (macOS + Linux)
# Author: Yuval Avidani (YUV.AI) - https://yuv.ai
#
# Public install (no clone required):
#   curl -fsSL https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.sh | bash
#
# Optional env:
#   LOGAN_HOME              config home (default: ~/.logan)
#   LOGAN_INSTALL_SRC       existing checkout path (skip clone)
#   LOGAN_INSTALL_DIR       where to clone source (default: ~/.logan/src/logan-cli)
#   LOGAN_INSTALL_NO_START  set to 1 to never auto-start TUI
#   LOGAN_INSTALL_NO_BUILD  set to 1 to only place an existing binary (dev)
#   LOGAN_REPO              git URL (default: https://github.com/hoodini/logan-cli.git)
#   LOGAN_REF               git ref (default: main)
#   CI / NONINTERACTIVE     skip auto-start when set
#
set -euo pipefail

LOGAN_REPO="${LOGAN_REPO:-https://github.com/hoodini/logan-cli.git}"
LOGAN_REF="${LOGAN_REF:-main}"
LOGAN_HOME="${LOGAN_HOME:-${HOME}/.logan}"
LOGAN_INSTALL_DIR="${LOGAN_INSTALL_DIR:-${LOGAN_HOME}/src/logan-cli}"
LOCAL_BIN="${HOME}/.local/bin"
MANAGED_BIN="${LOGAN_HOME}/bin"
GITHUB_REPO="${GITHUB_REPO:-hoodini/logan-cli}"

# ---------- helpers ----------
log()  { printf '==> %s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || return 1
}

is_interactive() {
  # Auto-start when the user is at a real terminal.
  # curl|bash pipes stdin (not a TTY) but stdout/controlling tty still are -
  # so do NOT require -t 0. Prefer -t 1 (stdout) or a usable /dev/tty.
  if [[ "${LOGAN_INSTALL_NO_START:-}" == "1" ]]; then return 1; fi
  if [[ -n "${CI:-}" || -n "${NONINTERACTIVE:-}" ]]; then return 1; fi
  if [[ -t 1 ]]; then return 0; fi
  if [[ -r /dev/tty && -w /dev/tty ]]; then return 0; fi
  return 1
}

# Optional probe entry for tests: LOGAN_INSTALL_PROBE=is_interactive
# prints "yes"/"no" and exits without installing.
maybe_probe() {
  case "${LOGAN_INSTALL_PROBE:-}" in
    is_interactive)
      if is_interactive; then echo yes; else echo no; fi
      exit 0
      ;;
  esac
}

os_arch() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "${arch}" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *) die "unsupported CPU arch: ${arch}" ;;
  esac
  case "${os}" in
    darwin) os="macos" ;;
    linux) os="linux" ;;
    msys*|mingw*|cygwin*) os="windows" ;;
    *) die "unsupported OS: ${os}. On Windows use: irm https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.ps1 | iex" ;;
  esac
  printf '%s %s\n' "${os}" "${arch}"
}

ensure_path_export() {
  export PATH="${LOCAL_BIN}:${HOME}/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"
  local shell_rc=""
  case "${SHELL:-}" in
    */zsh) shell_rc="${HOME}/.zshrc" ;;
    */bash) shell_rc="${HOME}/.bashrc" ;;
    *) shell_rc="${HOME}/.profile" ;;
  esac
  if [[ -n "${shell_rc}" ]] && [[ -w "${shell_rc}" || ! -e "${shell_rc}" ]]; then
    if ! grep -q '\.local/bin' "${shell_rc}" 2>/dev/null; then
      {
        echo ''
        echo '# Logan CLI'
        echo 'export PATH="$HOME/.local/bin:$PATH"'
      } >> "${shell_rc}"
      log "Added ~/.local/bin to PATH in ${shell_rc}"
    fi
  fi
}

install_bin_atomic() {
  local src="$1" dest="$2"
  local tmp="${dest}.new.$$"
  mkdir -p "$(dirname "${dest}")"
  cp -f "${src}" "${tmp}"
  chmod +x "${tmp}"
  mv -f "${tmp}" "${dest}"
}

# ---------- prerequisite bootstrap ----------
ensure_curl_or_wget() {
  if need_cmd curl || need_cmd wget; then return 0; fi
  die "need curl or wget to download Logan. Install curl, then re-run the one-liner."
}

ensure_git() {
  if need_cmd git; then return 0; fi
  log "git missing - trying to install…"
  if [[ "$(uname -s)" == "Darwin" ]] && need_cmd brew; then
    brew install git
  elif need_cmd apt-get; then
    sudo apt-get update -y && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git
  elif need_cmd dnf; then
    sudo dnf install -y git
  elif need_cmd yum; then
    sudo yum install -y git
  elif need_cmd pacman; then
    sudo pacman -Sy --noconfirm git
  else
    die "git is required. Install git, then re-run: curl -fsSL https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.sh | bash"
  fi
  need_cmd git || die "git still missing after install attempt"
}

ensure_rust() {
  export PATH="${HOME}/.cargo/bin:${PATH}"
  if need_cmd cargo && need_cmd rustc; then
    log "Rust: $(rustc --version 2>/dev/null | head -1)"
    return 0
  fi
  log "Rust missing - installing rustup (non-interactive)…"
  ensure_curl_or_wget
  if need_cmd curl; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  else
    wget -qO- https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  fi
  # shellcheck disable=SC1091
  source "${HOME}/.cargo/env" 2>/dev/null || true
  export PATH="${HOME}/.cargo/bin:${PATH}"
  need_cmd cargo || die "cargo still missing after rustup. Open a new shell or: source \$HOME/.cargo/env"
  log "Rust installed: $(rustc --version 2>/dev/null | head -1)"
}

ensure_protoc() {
  if [[ -n "${PROTOC:-}" && -x "${PROTOC}" ]]; then return 0; fi
  if need_cmd protoc; then
    export PROTOC
    PROTOC="$(command -v protoc)"
    return 0
  fi
  # Prefer repo-vendored protoc after clone
  if [[ -n "${REPO_ROOT:-}" && -x "${REPO_ROOT}/bin/protoc" ]]; then
    export PROTOC="${REPO_ROOT}/bin/protoc"
    return 0
  fi
  log "protoc missing - trying package managers…"
  if [[ "$(uname -s)" == "Darwin" ]] && need_cmd brew; then
    brew install protobuf || true
  elif need_cmd apt-get; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y protobuf-compiler || true
  elif need_cmd dnf; then
    sudo dnf install -y protobuf-compiler || true
  elif need_cmd yum; then
    sudo yum install -y protobuf-compiler || true
  fi
  if need_cmd protoc; then
    export PROTOC
    PROTOC="$(command -v protoc)"
    return 0
  fi
  # Download official protoc release as last resort
  local os arch tag url tmp
  read -r os arch < <(os_arch)
  tag="v28.3"
  case "${os}-${arch}" in
    macos-x86_64) url="https://github.com/protocolbuffers/protobuf/releases/download/${tag}/protoc-28.3-osx-x86_64.zip" ;;
    macos-aarch64) url="https://github.com/protocolbuffers/protobuf/releases/download/${tag}/protoc-28.3-osx-aarch_64.zip" ;;
    linux-x86_64) url="https://github.com/protocolbuffers/protobuf/releases/download/${tag}/protoc-28.3-linux-x86_64.zip" ;;
    linux-aarch64) url="https://github.com/protocolbuffers/protobuf/releases/download/${tag}/protoc-28.3-linux-aarch_64.zip" ;;
    *) die "cannot auto-fetch protoc for ${os}/${arch}. Install protoc and re-run." ;;
  esac
  tmp="$(mktemp -d)"
  log "Downloading protoc ${tag}…"
  if need_cmd curl; then
    curl -fsSL "${url}" -o "${tmp}/protoc.zip"
  else
    wget -qO "${tmp}/protoc.zip" "${url}"
  fi
  mkdir -p "${LOGAN_HOME}/tools/protoc"
  if need_cmd unzip; then
    unzip -qo "${tmp}/protoc.zip" -d "${LOGAN_HOME}/tools/protoc"
  else
    # python unzip fallback
    python3 - "${tmp}/protoc.zip" "${LOGAN_HOME}/tools/protoc" <<'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
PY
  fi
  export PROTOC="${LOGAN_HOME}/tools/protoc/bin/protoc"
  chmod +x "${PROTOC}" 2>/dev/null || true
  [[ -x "${PROTOC}" ]] || die "failed to install protoc to ${PROTOC}"
  log "protoc ready: ${PROTOC}"
  rm -rf "${tmp}"
}

# ---------- source + binary ----------
try_prebuilt_release() {
  # Returns 0 and sets BIN_SRC if a matching GitHub release asset was installed.
  need_cmd curl || return 1
  local os arch asset tag api url
  read -r os arch < <(os_arch)
  # asset naming convention if/when published: logan-{os}-{arch}
  asset="logan-${os}-${arch}"
  if [[ "${os}" == "windows" ]]; then asset="${asset}.exe"; fi
  api="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
  tag="$(curl -fsSL "${api}" 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tag_name",""))' 2>/dev/null || true)"
  [[ -n "${tag}" ]] || return 1
  url="https://github.com/${GITHUB_REPO}/releases/download/${tag}/${asset}"
  log "Trying prebuilt ${asset} @ ${tag}…"
  local dest="${MANAGED_BIN}/logan"
  mkdir -p "${MANAGED_BIN}"
  if curl -fsSL "${url}" -o "${dest}.dl" 2>/dev/null; then
    chmod +x "${dest}.dl"
    if file "${dest}.dl" 2>/dev/null | grep -qiE 'executable|Mach-O|ELF|PE32'; then
      mv -f "${dest}.dl" "${dest}"
      BIN_SRC="${dest}"
      log "Prebuilt binary installed from release ${tag}"
      return 0
    fi
    rm -f "${dest}.dl"
  fi
  return 1
}

resolve_repo_root() {
  # Prefer explicit src, then (only when run as a real file) local checkout,
  # then clone into LOGAN_INSTALL_DIR. curl|bash is always treated as piped:
  # never grab a random cwd that happens to contain Cargo.toml.
  if [[ -n "${LOGAN_INSTALL_SRC:-}" && -f "${LOGAN_INSTALL_SRC}/Cargo.toml" ]]; then
    REPO_ROOT="$(cd "${LOGAN_INSTALL_SRC}" && pwd)"
    log "Using LOGAN_INSTALL_SRC=${REPO_ROOT}"
    return 0
  fi

  local src_file="${BASH_SOURCE[0]:-}"
  local piped=0
  # Piped install: stdin not a TTY, or script path is not a real file on disk.
  if [[ ! -t 0 ]] || [[ -z "${src_file}" || "${src_file}" == "bash" || ! -f "${src_file}" ]]; then
    piped=1
  fi

  if [[ "${piped}" -eq 0 ]]; then
    # `bash scripts/install-logan.sh` from a checkout - use that tree.
    local here
    here="$(cd "$(dirname "${src_file}")/.." 2>/dev/null && pwd || true)"
    if [[ -n "${here}" && -f "${here}/Cargo.toml" ]]; then
      REPO_ROOT="${here}"
      log "Using local checkout ${REPO_ROOT}"
      return 0
    fi
    if [[ -f ./Cargo.toml ]] && grep -q 'xai-grok-pager-bin\|logan' ./Cargo.toml 2>/dev/null; then
      REPO_ROOT="$(pwd)"
      log "Using cwd checkout ${REPO_ROOT}"
      return 0
    fi
  else
    log "Piped/bootstrap install - will clone into ${LOGAN_INSTALL_DIR}"
  fi

  # Clone or update into install dir
  ensure_git
  mkdir -p "$(dirname "${LOGAN_INSTALL_DIR}")"
  if [[ -d "${LOGAN_INSTALL_DIR}/.git" ]]; then
    log "Updating ${LOGAN_INSTALL_DIR} (${LOGAN_REF})…"
    # Managed clone: local edits must never block updates (checkout+pull
    # refuses silently on a dirty tree, leaving a stale source). Fetch the
    # ref and hard-reset to exactly what origin has.
    git -C "${LOGAN_INSTALL_DIR}" fetch --depth 1 origin "${LOGAN_REF}" || git -C "${LOGAN_INSTALL_DIR}" fetch origin "${LOGAN_REF}" || true
    git -C "${LOGAN_INSTALL_DIR}" reset --hard FETCH_HEAD 2>/dev/null || true
  else
    log "Cloning ${LOGAN_REPO} → ${LOGAN_INSTALL_DIR}…"
    rm -rf "${LOGAN_INSTALL_DIR}"
    git clone --depth 1 --branch "${LOGAN_REF}" "${LOGAN_REPO}" "${LOGAN_INSTALL_DIR}" \
      || git clone --depth 1 "${LOGAN_REPO}" "${LOGAN_INSTALL_DIR}"
  fi
  [[ -f "${LOGAN_INSTALL_DIR}/Cargo.toml" ]] || die "clone failed: no Cargo.toml in ${LOGAN_INSTALL_DIR}"
  REPO_ROOT="${LOGAN_INSTALL_DIR}"
  log "Using cloned tree ${REPO_ROOT}"
}

build_from_source() {
  ensure_rust
  ensure_protoc
  log "Building Logan release (this can take a few minutes)…"
  (
    cd "${REPO_ROOT}"
    export PATH="${HOME}/.cargo/bin:${PATH}"
    # One-shot installer build: incremental caches waste disk and (on MSVC
    # hosts) explode PDB module counts (LNK1318 LIMIT). Match CI behavior.
    export CARGO_INCREMENTAL=0
    if [[ -x "${REPO_ROOT}/bin/protoc" ]]; then
      export PROTOC="${REPO_ROOT}/bin/protoc"
    fi
    cargo build -p xai-grok-pager-bin --release
  )
  BIN_SRC="${REPO_ROOT}/target/release/logan"
  [[ -x "${BIN_SRC}" ]] || die "build finished but ${BIN_SRC} missing"
  log "Build OK: ${BIN_SRC}"
}

# ---------- config seed ----------
seed_config() {
  mkdir -p "${LOGAN_HOME}/memory" "${LOGAN_HOME}/hooks/bin" "${LOGAN_HOME}/skills" "${LOGAN_HOME}/sessions"
  local config="${LOGAN_HOME}/config.toml"
  if [[ ! -f "${config}" ]]; then
    cat > "${config}" <<'TOML'
# Logan config - Yuval Avidani (YUV.AI)
# Auth: logan login  OR  export XAI_API_KEY=...

[memory]
enabled = true

[memory.session]
save_on_end = true

[memory.dream]
enabled = true

[memory.initial_injection]
enabled = true

[compat.claude]
skills = true
rules = true
agents = true
mcps = true
hooks = true

[compat.cursor]
skills = true
rules = true
agents = true
mcps = true
hooks = true

[cli]
installer = "internal"
use_leader = false

[ui]
permission_mode = "always-approve"
yolo = false
TOML
    log "Wrote ${config}"
  else
    if ! grep -q '\[compat.claude\]' "${config}" 2>/dev/null; then
      cat >> "${config}" <<'TOML'

# --- appended by install-logan.sh ---
[compat.claude]
skills = true
mcps = true
hooks = true
rules = true
agents = true

[compat.cursor]
skills = true
mcps = true
hooks = true
rules = true
agents = true
TOML
      log "Appended compat defaults to ${config}"
    fi
    if ! grep -q 'use_leader' "${config}" 2>/dev/null; then
      printf '\n[cli]\nuse_leader = false\n' >> "${config}"
    fi
  fi

  # Skills are OPT-IN. Active skills dir starts empty.
  # Catalog = library you can install from (`/skills add …`).
  mkdir -p "${LOGAN_HOME}/skills" "${LOGAN_HOME}/catalog/skills"
  if [[ -n "${REPO_ROOT:-}" && -d "${REPO_ROOT}/skills" ]]; then
    for d in "${REPO_ROOT}/skills"/*; do
      [[ -d "${d}" ]] || continue
      name="$(basename "${d}")"
      dest="${LOGAN_HOME}/catalog/skills/${name}"
      mkdir -p "${dest}"
      cp -R "${d}/." "${dest}/"
    done
    log "Catalog refreshed at ${LOGAN_HOME}/catalog/skills (not auto-enabled)"
  fi
  # Optional: LOGAN_SEED_SKILLS=1 installs everything into active skills (power users)
  if [[ "${LOGAN_SEED_SKILLS:-}" == "1" || "${LOGAN_SEED_SKILLS:-}" == "true" ]]; then
    if [[ -d "${LOGAN_HOME}/catalog/skills" ]]; then
      for d in "${LOGAN_HOME}/catalog/skills"/*; do
        [[ -d "${d}" ]] || continue
        name="$(basename "${d}")"
        dest="${LOGAN_HOME}/skills/${name}"
        mkdir -p "${dest}"
        cp -R "${d}/." "${dest}/"
      done
      log "LOGAN_SEED_SKILLS=1 → installed all catalog skills into ${LOGAN_HOME}/skills"
    fi
  else
    log "Active skills stay empty by default. In Logan: /skills catalog · /skills add pack creative"
  fi
  # Optional sibling sync (opt-in only)
  if [[ "${LOGAN_SYNC_SIBLING_SKILLS:-}" == "1" || "${LOGAN_SYNC_SIBLING_SKILLS:-}" == "true" ]]; then
    sync_skills() {
      local src="$1"
      [[ -d "${src}" ]] || return 0
      local n=0 d name dest
      for d in "${src}"/*; do
        [[ -d "${d}" ]] || continue
        name="$(basename "${d}")"
        dest="${LOGAN_HOME}/skills/${name}"
        if [[ ! -e "${dest}" ]]; then
          cp -R "${d}" "${dest}"
          n=$((n + 1))
        fi
      done
      if [[ "${n}" -gt 0 ]]; then
        log "Synced ${n} skills from ${src}"
      fi
      return 0
    }
    sync_skills "${HOME}/.grok/skills" || true
    sync_skills "${HOME}/.claude/skills" || true
    sync_skills "${HOME}/.agents/skills" || true
  fi

  mkdir -p "${LOGAN_HOME}/rules" "${LOGAN_HOME}/memory"
  if [[ ! -f "${LOGAN_HOME}/modes.toml" ]]; then
    cat > "${LOGAN_HOME}/modes.toml" <<'TOML'
# Logan modes - all OFF by default. Opt-in with /caveman /ponytail /think
# Requires skills installed first: /skills add pack modes
[modes]
caveman = "off"
ponytail = "off"
think = "off"
TOML
  fi
  if [[ ! -f "${LOGAN_HOME}/rules/logan-modes.md" ]]; then
    cat > "${LOGAN_HOME}/rules/logan-modes.md" <<'MD'
# Logan active modes (default empty)

All modes OFF. No creative stack forced.

Optional (you choose):
- `/skills catalog` - see available skills
- `/skills add pack modes` - caveman / ponytail / yuvai-thinking
- `/skills add pack creative` - HyperFrames + scrub landings + reels
- `/think full` - only after yuvai-thinking is installed
- `/caveman full` - only after caveman is installed
MD
  fi
  # Do NOT seed PROFILE/MEMORY with personal templates by default.
  # Templates live in the repo under examples/config/ for copy-on-demand.
  if [[ ! -f "${LOGAN_HOME}/memory/IMPROVEMENTS.md" ]]; then
    cat > "${LOGAN_HOME}/memory/IMPROVEMENTS.md" <<'MD'
# IMPROVEMENTS

Optional self-improve journal. Use `/improve` after you install self-improve skill if you want.

MD
  fi

  # Self-improvement hooks: retrospective evidence capture (failed tools,
  # denied permissions, API errors -> IMPROVEMENTS.md at session end).
  # Managed files - refreshed on every install. auto-reflect (stub writer)
  # is superseded and no longer seeded; the example remains in the repo.
  if [[ -n "${REPO_ROOT:-}" && -f "${REPO_ROOT}/examples/hooks/retrospective.json" ]]; then
    cp -f "${REPO_ROOT}/examples/hooks/retrospective.json" "${LOGAN_HOME}/hooks/" 2>/dev/null || true
    if [[ -f "${REPO_ROOT}/examples/hooks/bin/retro-insight.py" ]]; then
      cp -f "${REPO_ROOT}/examples/hooks/bin/retro-insight.py" "${LOGAN_HOME}/hooks/bin/" 2>/dev/null || true
      chmod +x "${LOGAN_HOME}/hooks/bin/retro-insight.py" 2>/dev/null || true
    fi
    log "Retrospective hooks installed (session-end insights -> memory/IMPROVEMENTS.md)"
  fi
}

maybe_delegate_windows() {
  # Git Bash / MSYS / Cygwin: the bash path cannot build Logan on Windows
  # (cargo emits logan.exe, and MSVC env setup lives in the ps1). Hand the
  # whole install to install-logan.ps1, which owns the Windows story.
  case "$(uname -s | tr '[:upper:]' '[:lower:]')" in
    msys*|mingw*|cygwin*) ;;
    *) return 0 ;;
  esac
  log "Windows detected - delegating to install-logan.ps1 (MSVC + .exe handling)"
  local ps="powershell.exe"
  command -v pwsh.exe >/dev/null 2>&1 && ps="pwsh.exe"
  local src_file="${BASH_SOURCE[0]:-}"
  if [[ -n "${src_file}" && -f "${src_file}" ]]; then
    local ps1_path
    ps1_path="$(cd "$(dirname "${src_file}")" && pwd)/install-logan.ps1"
    if [[ -f "${ps1_path}" ]]; then
      command -v cygpath >/dev/null 2>&1 && ps1_path="$(cygpath -w "${ps1_path}")"
      exec "${ps}" -NoProfile -ExecutionPolicy Bypass -File "${ps1_path}"
    fi
  fi
  exec "${ps}" -NoProfile -ExecutionPolicy Bypass -Command \
    "irm https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.ps1 | iex"
}

# ---------- main ----------
main() {
  log "Logan one-command install (YUV.AI)"
  maybe_delegate_windows
  log "home: ${LOGAN_HOME}"
  ensure_curl_or_wget
  ensure_path_export
  mkdir -p "${LOGAN_HOME}" "${LOCAL_BIN}" "${MANAGED_BIN}"

  BIN_SRC=""
  REPO_ROOT=""

  if [[ "${LOGAN_INSTALL_NO_BUILD:-}" != "1" ]]; then
    if try_prebuilt_release; then
      :
    else
      resolve_repo_root
      # Reuse an existing release binary ONLY if it is newer than the
      # checked-out HEAD commit - otherwise git pull just brought new code and
      # reinstalling the old exe would make updates silently no-ops.
      release_fresh=0
      if [[ -x "${REPO_ROOT}/target/release/logan" ]]; then
        head_time="$(git -C "${REPO_ROOT}" log -1 --format=%ct 2>/dev/null || echo 0)"
        bin_time="$(stat -c %Y "${REPO_ROOT}/target/release/logan" 2>/dev/null \
          || stat -f %m "${REPO_ROOT}/target/release/logan" 2>/dev/null || echo 0)"
        if [[ "${head_time}" -eq 0 || "${bin_time}" -ge "${head_time}" ]]; then
          release_fresh=1
        fi
      fi
      if [[ "${release_fresh}" -eq 1 && "${LOGAN_FORCE_BUILD:-}" != "1" ]]; then
        log "Found existing build at ${REPO_ROOT}/target/release/logan"
        BIN_SRC="${REPO_ROOT}/target/release/logan"
      else
        build_from_source
      fi
    fi
  else
    resolve_repo_root
    BIN_SRC="${REPO_ROOT}/target/release/logan"
    [[ -x "${BIN_SRC}" ]] || die "LOGAN_INSTALL_NO_BUILD set but no binary at ${BIN_SRC}"
  fi

  [[ -n "${BIN_SRC}" && -x "${BIN_SRC}" ]] || die "no binary to install"

  install_bin_atomic "${BIN_SRC}" "${LOCAL_BIN}/logan"
  install_bin_atomic "${BIN_SRC}" "${MANAGED_BIN}/logan"
  seed_config

  export PATH="${LOCAL_BIN}:${PATH}"
  log "Installed:"
  if ! "${LOCAL_BIN}/logan" --version; then
    die "logan --version failed after install (${LOCAL_BIN}/logan)"
  fi
  log "  ${LOCAL_BIN}/logan"
  log "  ${MANAGED_BIN}/logan"

  # Optional headless smoke (never fails install)
  if "${LOCAL_BIN}/logan" -p "Reply with exactly: logan-ok" --always-approve --no-leader 2>/dev/null | grep -q logan-ok; then
    log "Headless smoke: OK (logan-ok)"
  else
    warn "Headless smoke skipped (run: logan login  or  export XAI_API_KEY=...)"
  fi

  echo ""
  echo "Next:"
  echo "  logan login     # once (browser)  OR  export XAI_API_KEY=..."
  echo "  logan           # open the app"
  echo "  /stats          # after a turn - token spend"
  echo "  /context deep   # real system prompt text"
  echo ""

  if is_interactive; then
    log "Starting Logan…"
    # Reattach stdin to the controlling terminal after curl|bash pipe install.
    if [[ -r /dev/tty && -w /dev/tty ]]; then
      exec "${LOCAL_BIN}/logan" </dev/tty >/dev/tty 2>&1
    else
      exec "${LOCAL_BIN}/logan"
    fi
  else
    log "Non-interactive install complete (no TUI start)."
    log "Run: ${LOCAL_BIN}/logan"
  fi
}

maybe_probe
main "$@"
