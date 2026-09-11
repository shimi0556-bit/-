#!/usr/bin/env bash
# README wow-readiness checks (drives shipped README + assets on disk).
# Author: Yuval Avidani (YUV.AI)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
README="${ROOT}/README.md"
ASSETS="${ROOT}/docs/assets"
SWOT="${ROOT}/docs/SWOT.md"
FAIL=0

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAIL=$((FAIL + 1)); }

# 1) No mermaid fences in root README
if rg -n '```mermaid|```[[:space:]]*mermaid' "${README}" >/dev/null 2>&1; then
  fail "README still contains mermaid fences"
else
  pass "README has zero mermaid fences"
fi

if rg -n '^\s*mermaid\s*$' "${README}" >/dev/null 2>&1; then
  fail "README has mermaid keyword line"
else
  pass "README has no mermaid diagram markers"
fi

# 2) One-command install still above SWOT / competitive section
install_line="$(rg -n 'install-logan\.sh \| bash' "${README}" | head -1 | cut -d: -f1)"
win_line="$(rg -n 'install-logan\.ps1' "${README}" | head -1 | cut -d: -f1)"
swot_line="$(rg -n 'SWOT|competitive-map|docs/SWOT' "${README}" | head -1 | cut -d: -f1)"
[[ -n "${install_line}" ]] && pass "README has curl|bash install" || fail "missing curl|bash"
[[ -n "${win_line}" ]] && pass "README has Windows install" || fail "missing Windows install"
if [[ -n "${install_line}" && -n "${swot_line}" && "${install_line}" -lt "${swot_line}" ]]; then
  pass "install one-liner appears before SWOT/competitive content (L${install_line} < L${swot_line})"
else
  fail "install not before SWOT (install=${install_line} swot=${swot_line})"
fi

# 3) Required infographics exist and are non-trivial
# JPGs are what GitHub visitors see; matching SVGs are editable sources.
REQUIRED_EMBED=(
  "infographic-one-command-install.jpg"
  "infographic-token-visibility.jpg"
  "infographic-competitive-map.jpg"
  "infographic-swot-summary.svg"
)
REQUIRED_ON_DISK=(
  "infographic-one-command-install.jpg"
  "infographic-one-command-install.svg"
  "infographic-token-visibility.jpg"
  "infographic-token-visibility.svg"
  "infographic-competitive-map.jpg"
  "infographic-competitive-map.svg"
  "infographic-swot-summary.svg"
)
for f in "${REQUIRED_ON_DISK[@]}"; do
  path="${ASSETS}/${f}"
  if [[ ! -f "${path}" ]]; then
    fail "missing asset ${f}"
    continue
  fi
  sz="$(wc -c < "${path}" | tr -d ' ')"
  if [[ "${sz}" -gt 1024 ]]; then
    pass "asset ${f} size=${sz}"
  else
    fail "asset ${f} too small (${sz} bytes)"
  fi
done
for f in "${REQUIRED_EMBED[@]}"; do
  if grep -q "${f}" "${README}"; then
    pass "README embeds ${f}"
  else
    fail "README does not embed ${f}"
  fi
done

# 4) SWOT structure for five named tools + Logan
[[ -f "${SWOT}" ]] || fail "missing docs/SWOT.md"
for tool in "GitHub Copilot" "Claude Code" "Cursor" "Hermes" "OpenClaw" "Logan"; do
  if grep -q "${tool}" "${SWOT}"; then
    pass "SWOT mentions ${tool}"
  else
    fail "SWOT missing ${tool}"
  fi
done
for box in "Strengths" "Weaknesses" "Opportunities" "Threats"; do
  n="$(grep -c "\*\*${box}\*\*" "${SWOT}" || true)"
  if [[ "${n}" -ge 5 ]]; then
    pass "SWOT has ${box} labels (count=${n})"
  else
    fail "SWOT weak ${box} coverage (count=${n})"
  fi
done

# Honest non-claims
if grep -qi 'we replace Cursor IDE\|Copilot-class IDE plugin' "${SWOT}" "${README}" 2>/dev/null; then
  fail "overclaim detected"
else
  pass "no false IDE-parity overclaim in SWOT/README headlines"
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo "FAILED: ${FAIL}"
  exit 1
fi
echo "ALL PASS"
exit 0
