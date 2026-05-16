# Diagnostic — wrangler/CF Pages `commit_message` UTF-8 bug

Byte-level evidence that wrangler is sending valid UTF-8 and the CF
Pages API is rejecting it anyway. All numbers measured on
wrangler 4.90.0 + Node 24.15 + Linux + `LANG=ru_RU.UTF-8`.

## 1. Source commit message

A real-world commit subject + body, 862 UTF-8 bytes:

```
nav: login link без return_to — после логина всегда в dashboard

После Stage 19 Nav вёл Sign in с return_to=<current_pathname>. На
главной (/en/) это значило: клик Sign in → login → ?return_to=/en/
→ после успеха возврат на home, а не в личный кабинет.

UX-ожидание: "я нажал Sign in, открой мне мой кабинет". return_to
нужен только когда auth-guard насильно вытолкнул юзера из защищённой
страницы — там redirect сам ставит правильный return_to. Из Nav
return_to не нужен; login defaults to /{locale}/dashboard (см.
login.astro fallback при пустом return_to).

Co-Authored-By: …
```

Multi-byte chars present: Cyrillic (`П`, `о`, `с`, …), em-dash (`—`,
`U+2014` = `e2 80 94`), right arrow (`→`, `U+2192` = `e2 86 92`).

```bash
$ git show -s --format=%B HEAD | wc -c
862
```

## 2. wrangler's `truncateUtf8Bytes`

From `node_modules/wrangler/wrangler-dist/cli.js:241075`:

```js
function truncateUtf8Bytes(str, maxBytes) {
  const bytes = Buffer.byteLength(str, "utf8");
  if (bytes <= maxBytes) return str;
  const chars = [];
  let byteCount = 0;
  for (const char of str) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (byteCount + charBytes > maxBytes) break;
    chars.push(char);
    byteCount += charBytes;
  }
  return chars.join("");
}
```

Iterates by codepoint (`for…of` on a string), never cuts mid-character.
The result is guaranteed valid UTF-8 of ≤`maxBytes` bytes.

`MAX_COMMIT_MESSAGE_BYTES = 384` (cli.js:244618).

## 3. Output of running the truncation locally

```bash
$ node -e '
const cp = require("child_process");
function truncateUtf8Bytes(str, maxBytes) {
  const bytes = Buffer.byteLength(str, "utf8");
  if (bytes <= maxBytes) return str;
  const chars = []; let byteCount = 0;
  for (const char of str) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (byteCount + charBytes > maxBytes) break;
    chars.push(char); byteCount += charBytes;
  }
  return chars.join("");
}
const msg = cp.execFileSync("git",["show","-s","--format=%B","HEAD"]).toString().trim();
const t = truncateUtf8Bytes(msg, 384);
console.log("original bytes:", Buffer.byteLength(msg, "utf8"));
console.log("truncated bytes:", Buffer.byteLength(t, "utf8"));
console.log("valid utf8?:", Buffer.from(t, "utf8").toString("utf8") === t);
'
original bytes: 862
truncated bytes: 383
valid utf8?: true
```

Last 30 bytes of the truncated string (hex):

```
58 2d d0 be d0 b6 d0 b8 d0 b4 d0 b0 d0 bd d0 b8
d0 b5 3a 20 22 d1 8f 20 d0 bd d0 b0 d0 b6
```

Decoded: `X-ожидание: "я наж`. All multi-byte sequences are complete
2-byte Cyrillic encodings — no truncated codepoint.

## 4. Server response

```
$ pnpm exec wrangler pages deploy ./dist \
    --project-name <project> --branch main

…
🌎 Deploying...

✘ [ERROR] A request to the Cloudflare API
  (/accounts/<id>/pages/projects/<project>/deployments) failed.

  Invalid commit message, it must be a valid UTF-8 string. [code: 8000111]
```

From `~/.config/.wrangler/logs/wrangler-*.log`:

```json
{
  "text": "A request to the Cloudflare API (...) failed.",
  "notes": [
    { "text": "Invalid commit message, it must be a valid UTF-8 string. [code: 8000111]" }
  ],
  "code": 8000111,
  "kind": "error"
}
```

## 5. Controlled tests

| `--commit-message` value | byte length | valid UTF-8 | server response |
|---|---:|:---:|---|
| `nav: remove return_to from Sign in link so login defaults to dashboard` (ASCII) | 70 | yes | accepted |
| `тест: проверка UTF-8 в commit_message` (Cyrillic only) | ~40 | yes | accepted |
| Truncated 383-byte real commit (Cyrillic + ASCII + → + —) | 383 | yes | **rejected, code 8000111** |

Short Cyrillic strings are accepted; a 383-byte valid-UTF-8 string is
rejected. The server's error code names UTF-8 validity but the
empirical trigger is byte length.

## 6. Where wrangler sends the value

From `cli.js:244407`:

```js
const formData = new import_undici19.FormData();
formData.append("manifest", JSON.stringify(manifest));
if (branch) formData.append("branch", branch);
if (commitMessage) {
  formData.append(
    "commit_message",
    truncateUtf8Bytes(commitMessage, MAX_COMMIT_MESSAGE_BYTES)
  );
}
…
await fetchResult(
  COMPLIANCE_REGION_CONFIG_PUBLIC,
  `/accounts/${accountId}/pages/projects/${projectName}/deployments`,
  { method: "POST", body: formData }
);
```

`undici@7.x` `FormData` serializes string values as UTF-8 bytes in
multipart/form-data — no charset coercion.

## 7. Conclusion

- wrangler's truncation is correct.
- wrangler's `MAX_COMMIT_MESSAGE_BYTES = 384` is too generous for the
  real server-side limit (suspected ≤256 bytes for multi-byte UTF-8).
- The server's `8000111: Invalid UTF-8` error is misleading — the
  actual trigger is byte length, not encoding.
- Fix-or-workaround options: see `ISSUE.md` §Suggested fixes.
