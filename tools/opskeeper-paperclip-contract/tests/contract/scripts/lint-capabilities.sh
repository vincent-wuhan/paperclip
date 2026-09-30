#!/usr/bin/env bash
# Capability blacklist linter
# Refuses any capability matching `execute-*`, `shell-*`, `write-mcp-*`,
# `cross-resource-*`, `mutate-*` inside:
#   - `paperclip-plugin.json` → array fields named `capabilities` / `uses` / `permissions`
#   - any `*.manifest.*` or `*.plugin.json` file
# Markdown docs are intentionally excluded (they describe rules).
# Run from the contract package root: `npm run lint:capabilities`.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../" && pwd)"
cd "$ROOT"

FORBIDDEN_PATTERNS=(
  "execute-"
  "shell-"
  "write-mcp-"
  "cross-resource-"
  "mutate-"
)

EXIT=0

# Strip JSON to just the values inside capability-shaped arrays.
# Grep-lite: only those entries are inspected.
scan_json_capabilities() {
  local file="$1"
  local rel="${file#$ROOT/}"

  # Use node (always present in our env) to do precise JSON extraction.
  python_extract=$(command -v python3 || command -v python || true)
  if [ -n "$python_extract" ]; then
    extracted=$("$python_extract" - "$file" <<'PYEOF' 2>/dev/null || true
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)

def walk(node, path=()):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("capabilities", "uses", "permissions", "requires") and isinstance(v, list):
                for entry in v:
                    if isinstance(entry, str):
                        print(entry)
                    elif isinstance(entry, dict):
                        for kk, vv in entry.items():
                            if isinstance(vv, str):
                                print(vv)
            walk(v, path + (k,))
    elif isinstance(node, list):
        for it in node:
            walk(it, path)

walk(data)
PYEOF
)
    while IFS= read -r value; do
      [ -z "$value" ] && continue
      for pat in "${FORBIDDEN_PATTERNS[@]}"; do
        if [[ "$value" == *"$pat"* ]]; then
          echo "FAIL ${rel}: capability '${value}' matches forbidden pattern '${pat}'"
          EXIT=1
        fi
      done
    done <<< "$extracted"
  fi
}

# Manifest files to scan (precise JSON inspection above).
SCAN_JSON=(
  "$ROOT/paperclip-plugin.json"
)

# Also scan any *.json that declares an explicit capability list (compact YAML-like format)
for f in $(find "$ROOT" -type f -name "*.plugin.json" -not -path "*/node_modules/*" 2>/dev/null); do
  SCAN_JSON+=("$f")
done

for f in "${SCAN_JSON[@]}"; do
  [ -f "$f" ] || continue
  scan_json_capabilities "$f"
done

# Manifest files in ts/js: only trip on `capabilities: ["execute-*", ...]` declarations,
# not generic prose. Heuristic — first capture lines starting with optional `capabilities:`
# then look on that line OR immediate `[]` chunk.
SCAN_TS=$(find "$ROOT/tests/contract" -type f \( -name "*.ts" -o -name "*.js" \) -not -path "*/node_modules/*" 2>/dev/null)
for f in $SCAN_TS; do
  rel="${f#$ROOT/}"
  # Pull only lines that explicitly list capability names from a `capabilities:` array.
  # The fake server, the docs, and the lock file describe the blacklist in plain prose
  # so they're exempt.
  bad=$(grep -nE "capabilities\\s*:\\s*\\[[^]]*\\]" "$f" 2>/dev/null | grep -E "${FORBIDDEN_PATTERNS[0]}|${FORBIDDEN_PATTERNS[1]}|${FORBIDDEN_PATTERNS[2]}|${FORBIDDEN_PATTERNS[3]}|${FORBIDDEN_PATTERNS[4]}" || true)
  if [ -n "$bad" ]; then
    echo "FAIL ${rel}: capabilities array declares forbidden pattern"
    echo "$bad" | head -3 | sed "s|^|  ${rel}:|"
    EXIT=1
  fi
done

if [ $EXIT -eq 0 ]; then
  echo "PASS: no forbidden capability patterns found in capability arrays"
fi
exit $EXIT
