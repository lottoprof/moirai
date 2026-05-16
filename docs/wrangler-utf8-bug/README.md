# wrangler 4.90.0 + CF Pages — `commit_message` UTF-8 bug repro

Materials for a `cloudflare/workers-sdk` GitHub issue.

## Files

- **`ISSUE.md`** — ready-to-paste issue body for
  https://github.com/cloudflare/workers-sdk/issues/new. Includes
  summary, repro steps, suggested fixes, and a downstream workaround.
- **`repro.sh`** — one-shot bash repro. Creates a throwaway `dist/`
  and runs `wrangler pages deploy` with a >500-byte multi-byte UTF-8
  commit message on a non-production preview branch. Expected to fail
  with `8000111`.
- **`diagnostic.md`** — byte-level inspection of what wrangler sends,
  proof that the truncated payload is valid UTF-8, controlled-test
  table showing which lengths/contents the API accepts vs rejects.
- **`expected-error.txt`** — raw wrangler output + log fragment for
  the failing case, plus successful sanity-check calls.

## How to file

1. Open https://github.com/cloudflare/workers-sdk/issues/new/choose →
   pick "🐛 Bug Report".
2. Title:
   ```
   [Pages] commit_message rejected with 8000111 "Invalid UTF-8" for valid multi-byte payloads within wrangler's 384-byte cap
   ```
3. Body: copy from `ISSUE.md`.
4. Attach `diagnostic.md` and `expected-error.txt` as collapsed
   `<details>` blocks if the maintainers want the byte-level evidence
   inline.
5. Optionally link the upstream commits where wrangler's
   `truncateUtf8Bytes` and `MAX_COMMIT_MESSAGE_BYTES` live so the
   triage path is short.

## Downstream workaround (in this repo)

`package.json` deploy scripts pass `--commit-message "$(git log -1
--pretty=%s)"` — only the commit subject line (≤72 chars by git
convention) reaches CF. Full message stays in git.

See `.agent/skills/deploy/SKILL.md` pitfall #10 for the full
project-internal note.
