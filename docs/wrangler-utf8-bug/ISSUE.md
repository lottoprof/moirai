# [Pages] `wrangler pages deploy` fails with misleading "Invalid UTF-8 string" error for valid multi-byte commit messages within `MAX_COMMIT_MESSAGE_BYTES`

## Which Cloudflare product(s) does this pertain to?

Pages

## What version(s) of the tool(s) are you using?

`wrangler` 4.90.0 (also reproducible against the latest 4.x at time of filing).

## What version of Node are you using?

24.15.0 (also reproducible on 22.x).

## What operating system and version are you using?

Linux 6.17 / Ubuntu 24.04. `LANG=ru_RU.UTF-8`.

## Describe the Bug

`wrangler pages deploy` rejects valid UTF-8 commit messages with a
**misleading error** when the message contains multi-byte characters
(e.g. Cyrillic, em-dash `—`, arrow `→`) and is near, but well within,
wrangler's own cap `MAX_COMMIT_MESSAGE_BYTES = 384` (cli.js:244618).

```
✘ [ERROR] A request to the Cloudflare API
  (/accounts/<id>/pages/projects/<project>/deployments) failed.
  Invalid commit message, it must be a valid UTF-8 string. [code: 8000111]
```

The bytes wrangler actually sends are valid UTF-8 — confirmed both by
round-tripping the string through `Buffer.from(s, 'utf8').toString('utf8')
=== s` and by inspecting raw bytes (`od -c`). wrangler's
`truncateUtf8Bytes` (cli.js:241075) is codepoint-safe and never cuts
mid-character.

So the API's `8000111` error message **is wrong**: it claims invalid
UTF-8, but the actual cause appears to be a server-side **byte-length
limit** that is **smaller than wrangler's 384** when the message uses
multi-byte chars.

### Empirical observations

| commit_message content | byte length | result |
|---|---:|---|
| ASCII-only, any length up to wrangler's cap | ≤384 | accepted |
| Short Cyrillic, e.g. `"тест: проверка UTF-8 в commit_message"` | ~40 | accepted |
| Mixed Cyrillic + ASCII + `→` + `—`, truncated by wrangler to its cap | 383 | **rejected with 8000111** |

The 383-byte payload that triggers the failure is a strictly valid
UTF-8 string — see `repro.sh` and `diagnostic.md` for full inspection.
The error is reproducible across deployments. Falling back to a short
ASCII subject line via `--commit-message` is the only workaround that
sidesteps wrangler's truncation.

## Please provide a link to a minimal reproduction

Self-contained repro lives at:
- `repro.sh` — one-shot bash script (needs a Pages project + `wrangler login`)
- `diagnostic.md` — byte-level inspection of what wrangler sends
- `expected-error.txt` — full failing wrangler output

The repro creates a throwaway `dist/` with a single HTML file and
deploys it under `--branch repro-utf8-too-long` (preview, never
promoted to production).

## Please provide any relevant error logs

```
✘ [ERROR] A request to the Cloudflare API (/accounts/<redacted>/pages/projects/<redacted>/deployments) failed.

  Invalid commit message, it must be a valid UTF-8 string. [code: 8000111]

  If you think this is a bug, please open an issue at:
  https://github.com/cloudflare/workers-sdk/issues/new/choose
```

From the wrangler debug log:

```
"errorType":"APIError"
"sanitizedCommand":"pages deploy"
"argsCombination":"branch, projectName"
text: "Invalid commit message, it must be a valid UTF-8 string. [code: 8000111]"
```

## Diagnostic notes

- `MAX_COMMIT_MESSAGE_BYTES = 384` (wrangler-dist/cli.js:244618).
- `truncateUtf8Bytes` (cli.js:241075) iterates via
  `for (const char of str)` (codepoint-safe) and accumulates UTF-8
  byte counts via `Buffer.byteLength(char, 'utf8')` — output is
  guaranteed to be ≤`maxBytes` and a valid UTF-8 string.
- Output of the function for a 862-byte commit message: 383 bytes,
  ends mid-word at `…я наж` (codepoint boundary), valid UTF-8.
- The 383-byte payload is then `formData.append("commit_message", ...)`
  and POSTed to `/accounts/{id}/pages/projects/{name}/deployments`
  via undici 7.x — neither layer mangles UTF-8.
- Server still returns `8000111: Invalid commit message, it must be
  a valid UTF-8 string`.

The most plausible cause: the receiving service has a stricter
byte-length cap (perhaps a `VARCHAR(N)` column or a smaller server-side
limit) and surfaces overruns through the generic
`InvalidUtf8` error code. The wrangler-side constant should match the
real server-side limit, **or** the server should return a proper
"too long" error.

## Suggested fixes

Option A (client): lower `MAX_COMMIT_MESSAGE_BYTES` in wrangler to
the actual server cap (suspected ≤256 bytes for multi-byte content).
This makes truncation match the contract.

Option B (server): accept up to 384 bytes (or whatever the spec says),
**or** return a discriminated error code such as
`CommitMessageTooLong` instead of `InvalidUtf8`.

Option C (interim, in wrangler): default to using only the first line
of the commit message (`%s`, the git subject) which is conventionally
≤70 chars and always fits, dropping the body. This is the workaround
we ended up applying downstream.

## Workaround for users hitting this today

Pass an explicitly short `--commit-message`:

```bash
wrangler pages deploy ./dist \
  --project-name my-project \
  --branch main \
  --commit-message "$(git log -1 --pretty=%s)"
```

`%s` is the commit subject line (≤72 chars per git convention) and
always survives the server-side cap. The body of the commit message
won't show up in the Pages dashboard, but the full message stays in
git, where it's authoritative.
