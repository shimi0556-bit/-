#!/usr/bin/env bash
# Tests for one-command Logan install (drives shipped scripts).
# Author: Yuval Avidani (YUV.AI)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SH="${ROOT}/scripts/install-logan.sh"
PS1="${ROOT}/scripts/install-logan.ps1"
FAIL=0

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAIL=$((FAIL + 1)); }

# --- static: scripts exist and advertise one-liners ---
[[ -f "${SH}" ]] || fail "missing install-logan.sh"
[[ -f "${PS1}" ]] || fail "missing install-logan.ps1"
[[ -x "${SH}" ]] || chmod +x "${SH}"

grep -q 'raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.sh' "${SH}" \
  && pass "bash one-liner URL in install-logan.sh" \
  || fail "bash one-liner URL missing"

grep -q 'install-logan.ps1' "${PS1}" \
  && pass "ps1 self-reference present" \
  || fail "ps1 missing self URL"

README="${ROOT}/README.md"
grep -q 'install-logan.sh | bash' "${README}" \
  && pass "README has curl|bash one-liner" \
  || fail "README missing curl|bash"
grep -qi 'install-logan.ps1' "${README}" \
  && pass "README mentions Windows install" \
  || fail "README missing Windows install"

grep -q 'LOGAN_INSTALL_DIR' "${SH}" && grep -q 'git clone' "${SH}" \
  && pass "bootstrap can clone without checkout" \
  || fail "no clone bootstrap path"

grep -q 'rustup' "${SH}" && pass "auto rustup path" || fail "no rustup"
grep -q 'protoc' "${SH}" && pass "auto protoc path" || fail "no protoc"
grep -q 'try_prebuilt_release\|Prebuilt' "${SH}" && pass "prebuilt release path" || fail "no prebuilt"
grep -q 'is_interactive' "${SH}" && pass "interactive gate" || fail "no interactive gate"
grep -q '/dev/tty' "${SH}" && pass "curl|bash tty reattach" || fail "no /dev/tty reattach"
grep -q 'CI' "${SH}" && pass "CI non-interactive" || fail "no CI gate"

grep -qi 'rustup' "${PS1}" && pass "ps1 rustup" || fail "ps1 no rustup"
grep -qi 'Ensure-Protoc\|protoc' "${PS1}" && pass "ps1 protoc bootstrap" || fail "ps1 no protoc"
grep -q 'LOGAN_INSTALL_NO_START' "${PS1}" && pass "ps1 interactive gate" || fail "ps1 no interactive gate"
# Must NOT require IsInputRedirected false for start (irm|iex always redirects)
if grep -q 'IsInputRedirected' "${PS1}"; then
  if grep -q 'UserInteractive.*IsInputRedirected\|IsInputRedirected.*UserInteractive' "${PS1}"; then
    fail "ps1 still blocks on IsInputRedirected (breaks irm|iex auto-start)"
  else
    pass "ps1 IsInputRedirected not blocking start"
  fi
else
  pass "ps1 does not use IsInputRedirected"
fi
# Free-console contract: one function owns the Start-Process new-console launch
if grep -q 'function Start-LoganFreeConsole' "${PS1}"; then
  pass "ps1 Start-LoganFreeConsole function exists"
else
  fail "ps1 missing Start-LoganFreeConsole function"
fi
# Body must use Start-Process WITHOUT -NoNewWindow (new console detaches from
# the irm pipe) and must NOT pass -UseShellExecute: that is a ProcessStartInfo
# property, not a Start-Process parameter - passing it throws at runtime.
_body="$(awk '/function Start-LoganFreeConsole/,/^}/' "${PS1}")"
if echo "${_body}" | grep -q 'Start-Process' \
  && ! echo "${_body}" | grep -q 'NoNewWindow' \
  && ! echo "${_body}" | grep -qE 'Start-Process.*UseShellExecute'; then
  pass "ps1 free-console body: Start-Process, no -NoNewWindow, no -UseShellExecute param"
else
  fail "ps1 Start-LoganFreeConsole must use Start-Process without -NoNewWindow/-UseShellExecute"
fi
# Interactive branch must call the free-console function (not bare &)
if grep -A6 'if (Test-Interactive)' "${PS1}" | grep -q 'Start-LoganFreeConsole'; then
  pass "ps1 Test-Interactive calls Start-LoganFreeConsole"
else
  fail "ps1 Test-Interactive does not call Start-LoganFreeConsole"
fi
# Fail if interactive branch still has bare call-operator start of destLocal
# (ignore comments: lines starting with optional whitespace then #)
if grep -A8 'if (Test-Interactive)' "${PS1}" | grep -vE '^\s*#' | grep -qE '&\s*\$destLocal'; then
  fail "ps1 interactive branch still has bare call-operator start"
else
  pass "ps1 interactive branch has no bare call-operator start"
fi

# Drive SHIPPED free-console contract via probe (no reimplementation)
if command -v pwsh >/dev/null 2>&1; then
  probe_out="$(LOGAN_INSTALL_PROBE=start_command pwsh -NoProfile -File "${PS1}" 2>/dev/null | tr -d '\r' | tail -1)"
  if echo "${probe_out}" | grep -q 'start=Start-Process' && echo "${probe_out}" | grep -q 'NewConsole=true'; then
    pass "shipped ps1 probe start_command => ${probe_out}"
  else
    fail "shipped ps1 probe start_command unexpected: '${probe_out}'"
  fi
elif command -v powershell >/dev/null 2>&1; then
  probe_out="$(LOGAN_INSTALL_PROBE=start_command powershell -NoProfile -File "${PS1}" 2>/dev/null | tr -d '\r' | tail -1)"
  if echo "${probe_out}" | grep -q 'start=Start-Process' && echo "${probe_out}" | grep -q 'NewConsole=true'; then
    pass "shipped ps1 probe start_command => ${probe_out}"
  else
    fail "shipped ps1 probe start_command unexpected: '${probe_out}'"
  fi
else
  # No PowerShell on this host: still require contract string from shipped helper
  if grep -q 'start=Start-Process;NewConsole=true' "${PS1}"; then
    pass "ps1 embeds start contract token (no pwsh on host)"
  else
    fail "ps1 missing start contract token for probe"
  fi
fi

# --- Windows build environment (LNK1104 libcmt.lib regression) ---
# ps1 must select a COMPLETE MSVC toolset (a VS install can ship the compiler
# without desktop libs, e.g. onecore-only) and import its vcvars env.
grep -q 'Ensure-MsvcBuildTools' "${PS1}" && grep -q 'libcmt.lib' "${PS1}" && grep -qi 'vcvarsall' "${PS1}" \
  && pass "ps1 selects complete MSVC toolset (libcmt.lib check + vcvarsall import)" \
  || fail "ps1 missing MSVC toolset selection (LNK1104 libcmt.lib guard)"
awk '/Ensure-Rust$/{found=1} /Ensure-MsvcBuildTools/{if(found) ok=1} END{exit ok?0:1}' "${PS1}" \
  && pass "ps1 runs MSVC check in build path" \
  || fail "ps1 build path does not call Ensure-MsvcBuildTools"
grep -q 'LASTEXITCODE' "${PS1}" && grep -A3 'cargo build' "${PS1}" | grep -q 'LASTEXITCODE' \
  && pass "ps1 checks cargo build exit code" \
  || fail "ps1 does not check cargo build exit code"

# sh must hand Windows (Git Bash/MSYS/Cygwin) installs to the ps1
grep -q 'maybe_delegate_windows' "${SH}" && grep -q 'install-logan.ps1' "${SH}" \
  && pass "sh delegates Windows installs to install-logan.ps1" \
  || fail "sh missing Windows delegation to install-logan.ps1"

# ps1 must survive replacing a RUNNING logan.exe (rename-aside, not delete)
awk '/function Install-Binary/,/^}/' "${PS1}" | grep -q 'old\.' \
  && pass "ps1 Install-Binary renames running exe aside" \
  || fail "ps1 Install-Binary cannot replace a running exe"

# Installer builds must be non-incremental (disk + MSVC PDB pressure)
grep -q 'CARGO_INCREMENTAL' "${PS1}" && grep -q 'CARGO_INCREMENTAL=0' "${SH}" \
  && pass "installer builds set CARGO_INCREMENTAL=0" \
  || fail "installer builds missing CARGO_INCREMENTAL=0"

# ps1 must fall back to a PDB-less link when MSVC 14.44 dies with LNK1318
grep -q 'LNK1318' "${PS1}" && grep -q 'DEBUG:NONE' "${PS1}" \
  && pass "ps1 has LNK1318 -> /DEBUG:NONE relink fallback" \
  || fail "ps1 missing LNK1318 /DEBUG:NONE fallback"

# --- Self-improvement: retrospective hooks seeded by both installers ---
grep -q 'retrospective.json' "${PS1}" && grep -q 'retro-insight.py' "${PS1}" \
  && pass "ps1 seeds retrospective hooks" \
  || fail "ps1 missing retrospective hook seed"
grep -q 'retrospective.json' "${SH}" && grep -q 'retro-insight.py' "${SH}" \
  && pass "sh seeds retrospective hooks" \
  || fail "sh missing retrospective hook seed"
[[ -f "${ROOT}/examples/hooks/retrospective.json" && -f "${ROOT}/examples/hooks/bin/retro-insight.py" ]] \
  && pass "retrospective hook files exist" \
  || fail "retrospective hook files missing"
[[ -f "${ROOT}/skills/yuv-design-dna/SKILL.md" ]] \
  && pass "yuv-design-dna skill in catalog" \
  || fail "yuv-design-dna skill missing"
grep -q 'yuv-design-dna' "${ROOT}/crates/codegen/xai-grok-pager/src/slash/commands/logan_modes.rs" \
  && pass "yuv-design-dna wired into creative pack" \
  || fail "yuv-design-dna not in creative pack"

# retro-insight must aggregate real failures into IMPROVEMENTS.md (drive it)
if command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1; then
  PYBIN="$(command -v python3 || command -v python)"
  TESTHOME="$(mktemp -d)/lh"
  mkdir -p "${TESTHOME}/memory"
  echo '{"hookEventName":"post_tool_use_failure","sessionId":"cafe0001","toolName":"shell","toolInput":{"command":"x"},"error":"boom"}' \
    | LOGAN_HOME="${TESTHOME}" "${PYBIN}" "${ROOT}/examples/hooks/bin/retro-insight.py" 2>/dev/null
  echo '{"hookEventName":"session_end","sessionId":"cafe0001","reason":"exit","turnCount":1,"toolCallCount":2}' \
    | LOGAN_HOME="${TESTHOME}" "${PYBIN}" "${ROOT}/examples/hooks/bin/retro-insight.py" 2>/dev/null
  if grep -q 'session retrospective' "${TESTHOME}/memory/IMPROVEMENTS.md" 2>/dev/null \
    && grep -q 'boom' "${TESTHOME}/memory/IMPROVEMENTS.md" 2>/dev/null; then
    pass "retro-insight aggregates failures into IMPROVEMENTS.md"
  else
    fail "retro-insight did not write session retrospective"
  fi
  rm -rf "${TESTHOME%/lh}"
else
  pass "retro-insight drive skipped (no python on host)"
fi

grep -q '\[compat.claude\]' "${SH}" && pass "seeds compat.claude" || fail "no compat seed"
grep -q 'use_leader = false' "${SH}" && pass "seeds use_leader false" || fail "no use_leader seed"
grep -q 'install_bin_atomic\|.new.\$\$' "${SH}" && pass "atomic binary install" || fail "no atomic install"

# --- Drive SHIPPED is_interactive via LOGAN_INSTALL_PROBE (no reimplementation) ---
probe() {
  # Pipe stdin (simulates curl|bash) while keeping a real session when possible.
  # The shipped function must return yes when stdout is a TTY and CI/NO_START unset.
  LOGAN_INSTALL_PROBE=is_interactive "$@" bash "${SH}" </dev/null
}

out="$(LOGAN_INSTALL_NO_START=1 probe 2>/dev/null || true)"
[[ "${out}" == "no" ]] && pass "shipped probe: NO_START => no" || fail "shipped probe NO_START got '${out}'"

out="$(CI=1 probe 2>/dev/null || true)"
[[ "${out}" == "no" ]] && pass "shipped probe: CI => no" || fail "shipped probe CI got '${out}'"

out="$(NONINTERACTIVE=1 probe 2>/dev/null || true)"
[[ "${out}" == "no" ]] && pass "shipped probe: NONINTERACTIVE => no" || fail "shipped probe NONINTERACTIVE got '${out}'"

# Piped stdin + TTY stdout (this test harness is usually a TTY on stdout):
# must be "yes" so curl|bash would auto-start.
out="$(probe 2>/dev/null || true)"
if [[ -t 1 ]]; then
  [[ "${out}" == "yes" ]] && pass "shipped probe: piped stdin + TTY stdout => yes (curl|bash start)" \
    || fail "shipped probe expected yes for curl|bash-like, got '${out}'"
else
  # Non-TTY CI runner: accept no, but require /dev/tty path still present in script
  [[ "${out}" == "yes" || "${out}" == "no" ]] && pass "shipped probe ran in non-TTY harness (got ${out})" \
    || fail "shipped probe unexpected '${out}'"
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo "FAILED: ${FAIL} checks"
  exit 1
fi
echo "ALL PASS"
exit 0
