#!/usr/bin/env bash
#
# Minimal repro for wrangler 4.90.0 / CF Pages API `commit_message`
# UTF-8 byte-limit mismatch (issue: docs/wrangler-utf8-bug/ISSUE.md).
#
# Requires:
#   - a CF account with a Pages project you own
#   - `wrangler login` (or CLOUDFLARE_API_TOKEN env)
#   - bash, node, git, pnpm/npm
#
# Usage:
#   ./repro.sh <pages-project-name>
#
# What it does:
#   1. Creates a throwaway dist/ with a single HTML file.
#   2. Builds a commit message containing Cyrillic + em-dash + arrow,
#      padded to >500 bytes.
#   3. Runs `wrangler pages deploy ./dist --branch repro-utf8-too-long`
#      so it does NOT promote to your production alias.
#   4. Expected outcome: deploy succeeds (wrangler truncates to 384b
#      valid UTF-8, server should accept).
#   5. Observed outcome: server rejects with
#      `8000111: Invalid commit message, it must be a valid UTF-8 string`.
#
# Cleanup is not strictly necessary — preview branch deployments live
# in the project history but don't affect production. You can delete
# the deployment from the Pages dashboard if you wish.

set -euo pipefail

PROJECT="${1:?usage: $0 <pages-project-name>}"
TMPDIR="$(mktemp -d -t wrangler-utf8-repro-XXXXXX)"
DIST="$TMPDIR/dist"

mkdir -p "$DIST"
cat > "$DIST/index.html" <<'HTML'
<!doctype html>
<html><head><meta charset="utf-8"><title>repro</title></head>
<body><p>wrangler UTF-8 repro</p></body></html>
HTML

# Build a commit message: ASCII subject + multi-byte body, padded to
# ~500 bytes (well within wrangler's 384b cap after truncation, but
# wrangler will truncate to 383 bytes of valid UTF-8 — and CF will
# still reject).
MSG="$(node -e '
let s = "fix: commit с многобайтным UTF-8 — содержит → и — и кириллицу";
while (Buffer.byteLength(s, "utf8") < 500) {
  s += "\n\nпродолжение текста с примерами слов и пробелов, пример → пример";
}
process.stdout.write(s);
')"

echo "--- commit_message ($(printf %s "$MSG" | wc -c) bytes) ---"
echo "$MSG"
echo "--- valid UTF-8? ---"
node -e '
const m = process.argv[1];
const ok = Buffer.from(m, "utf8").toString("utf8") === m;
console.log(ok ? "yes" : "NO");
' -- "$MSG"

echo
echo "--- deploying with wrangler ---"
echo

# Note: --branch is a non-prod name so this won't replace production.
# If the issue manifests on your account, you'll see code 8000111.
if pnpm exec wrangler pages deploy "$DIST" \
    --project-name "$PROJECT" \
    --branch "repro-utf8-too-long" \
    --commit-message "$MSG"
then
  echo
  echo "✅ deploy succeeded — bug NOT reproduced on this account/version."
else
  rc=$?
  echo
  echo "❌ deploy failed with rc=$rc — bug reproduced."
  echo "Check ~/.config/.wrangler/logs/ for full debug output."
  exit "$rc"
fi
