#!/usr/bin/env bash
# Secrets linter
# Refuses hardcoded admin / shared credentials and `Authorization: Bearer <long>`
# strings anywhere outside of designated fixture / carrier paths.
#
# Allowed-by-design file (carve-outs):
#   - tests/contract/fake_opskeeper.ts      — rejection-table regex literals + sample tokens
#   - tests/contract/client.ts             — sample scoped tokens, exercised as legitimate scopes
#   - tests/contract/fixtures/tokens.json  — single-source-of-truth audit table
#                                            for the negative-fixture token set
#
# In-line mentions elsewhere in cases/ are allowed iff a `LINT-OK` marker
# is within ~10 lines above or below — the marker is the audit signal that
# the developer realised they were touching a forbidden prefix.
#
# Run from the contract package root: `npm run lint:secrets`.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../" && pwd)"
cd "$ROOT"

FORBIDDEN_REGEXES=(
  '(^|[^A-Za-z0-9])ok-admin-[A-Za-z0-9_-]{4,}'
  '(^|[^A-Za-z0-9])ok-write-[A-Za-z0-9_-]{4,}'
  '(^|[^A-Za-z0-9])ok-exec-[A-Za-z0-9_-]{4,}'
  '(^|[^A-Za-z0-9])sk-[A-Za-z0-9]{16,}'
  '(^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}'
  '-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----'
  'Authorization:\s*Bearer\s+[A-Za-z0-9._-]{16,}'
)

EXIT=0
CARVE_OUTS=(
  "./beny-491/tests/contract/fake_opskeeper.ts"
  "./beny-491/tests/contract/client.ts"
  "./beny-491/tests/contract/fixtures/tokens.json"
)

# Build the find command with carve-outs appended as -not -path predicates.
FIND_ARGS=(
  . -type f \( -name "*.json" -o -name "*.ts" -o -name "*.js" -o -name "*.md" -o -name "*.sh" -o -name "*.lock" \)
  -not -path "*/node_modules/*"
  -not -path "*/.git/*"
)
for co in "${CARVE_OUTS[@]}"; do
  FIND_ARGS+=( -not -path "$co" )
done
FILES_TO_SCAN=$(find "${FIND_ARGS[@]}" 2>/dev/null)

check_file() {
  local f="$1"
  local rel="${f#./}"
  for pat in "${FORBIDDEN_REGEXES[@]}"; do
    matches=$(grep -nE -- "$pat" "$f" 2>/dev/null || true)
    [ -z "$matches" ] && continue
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      lineno=$(echo "$line" | cut -d: -f1)
      # Look ±10 lines around the match for either LINT-OK marker or fixtureToken() call.
      line_count=$(wc -l < "$f")
      lo=$((lineno > 10 ? lineno - 10 : 1))
      hi=$((lineno + 10 < line_count ? lineno + 10 : line_count))
      window=$(awk -v lo="$lo" -v hi="$hi" 'NR >= lo && NR <= hi {print NR":"$0}' "$f")
      if echo "$window" | grep -qE "LINT-OK|fixtureToken\\("; then
        continue
      fi
      echo "FAIL ${rel}:${lineno}: blocked secret pattern (prepend '// LINT-OK: negative-fixture-token' within 10 lines or use fixtureToken(...))"
      echo "      ${line}"
      EXIT=1
    done <<< "$matches"
  done
}

for f in $FILES_TO_SCAN; do
  check_file "$f"
done

if [ $EXIT -eq 0 ]; then
  echo "PASS: no admin/secret patterns found in repo"
fi
exit $EXIT
