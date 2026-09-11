#!/usr/bin/env bash
# Guards for native modes / whoami / improve skills.
# Author: Yuval Avidani (YUV.AI)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAIL=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAIL=$((FAIL + 1)); }

for s in caveman ponytail whoami self-improve hyperframes-master yuvai-thinking \
  cinematic-scrub-landing parallax-landing-page video-edit video-to-landing-page yuv-pilot; do
  if [[ -f "${ROOT}/skills/${s}/SKILL.md" ]]; then
    pass "skill ${s}"
  else
    fail "missing skill ${s}"
  fi
done

for cmd in CavemanCommand PonytailCommand ThinkCommand ModesCommand CreativeCommand \
  SiteCommand ReelCommand WhoamiCommand ImproveCommand; do
  if rg -q "logan_modes::${cmd}" "${ROOT}/crates/codegen/xai-grok-pager/src/slash/commands/mod.rs"; then
    pass "command ${cmd}"
  else
    fail "missing command ${cmd}"
  fi
done
if rg -q "run_skills_manage" "${ROOT}/crates/codegen/xai-grok-pager/src/slash/commands/plugin.rs"; then
  pass "skills manage wired into /skills"
else
  fail "/skills manage not wired"
fi
if rg -q "catalog/skills" "${ROOT}/scripts/install-logan.sh" && rg -q "empty by default\|Active skills stay empty\|not auto-enabled\|not auto-enabled" "${ROOT}/scripts/install-logan.sh"; then
  pass "install keeps skills empty by default"
else
  if rg -q "Active skills stay empty" "${ROOT}/scripts/install-logan.sh"; then
    pass "install keeps skills empty by default"
  else
    fail "install still force-seeds active skills?"
  fi
fi
if [[ -f "${ROOT}/docs/MODES.md" ]]; then
  pass "docs/MODES.md"
else
  fail "missing MODES.md"
fi
if [[ -f "${ROOT}/docs/CREATIVE.md" ]]; then
  pass "docs/CREATIVE.md"
else
  fail "missing CREATIVE.md"
fi
if rg -q 'HyperFrames' "${ROOT}/README.md" && rg -q '/site' "${ROOT}/README.md"; then
  pass "README mentions creative stack"
else
  fail "README missing creative stack"
fi
if rg -q 'REPO_ROOT}/skills' "${ROOT}/scripts/install-logan.sh"; then
  pass "install seeds skills/"
else
  fail "install does not seed skills/"
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo "FAILED: ${FAIL}"
  exit 1
fi
echo "ALL PASS"
exit 0
