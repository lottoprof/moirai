/*
 * Password hashing + validation — PBKDF2-SHA256 600k iterations
 * (OWASP 2023 minimum для PBKDF2-SHA256).
 *
 * Argon2id рассматривался, но требует WASM в CF Workers (overhead на
 * cold-start). PBKDF2 нативен через Web Crypto API.
 *
 * Wire-format `secret_hash` (хранится в auth_methods.secret_hash):
 *   `pbkdf2-sha256$<iterations>$<salt-b64>$<hash-b64>`
 * Версионирование через имя алгоритма + iter — для будущей миграции
 * без breaking change.
 *
 * Password policy (NIST SP 800-63B 2017+):
 *   - min 10 chars (длина важнее complexity)
 *   - max 128 chars (защита от DoS на hash CPU)
 *   - blacklist common (топ-N + проектные слова)
 *   - НЕТ обязательной "1 upper + 1 lower + 1 digit + spec char" — это
 *     устаревший подход, заставляет писать `Passw0rd!`. Длина лучше.
 */

// Cloudflare Workers нативно ограничивает PBKDF2 100000 iter (workerd
// runtime constraint, не наш выбор). OWASP-2023 рекомендует 600k —
// если когда-нибудь дойдём до строгого требования: миграция на
// Argon2id через WASM (формат `secret_hash` включает `pbkdf2-sha256$
// <iter>$...` префикс — алгоритм-агностичный verify).
// См. decisions_archive.md 2026-05-15.
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const ALG = "pbkdf2-sha256";

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

/** Распространённые слабые пароли — нормализация в lowercase для substring match. */
const PASSWORD_BLACKLIST = [
  "password", "passw0rd", "12345678", "qwerty", "qwertyui", "qwerty123",
  "letmein", "welcome", "admin", "abc123", "iloveyou", "monkey",
  "dragon", "master", "trustno1", "sunshine",
  // Project-specific
  "moirai", "moiraionline", "film", "filmmaking",
];

const enc = new TextEncoder();

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/**
 * Decode base64 OR base64url to bytes.
 *
 * `hashPassword()` пишет стандартный base64 (`btoa` → `+`/`/`), но
 * исторически часть hashes попала в DB как base64url (`-`/`_`, без
 * padding) — например через manual seed или внешние утилиты. Парсер
 * нормализует оба варианта в standard base64 перед `atob()`.
 */
function b64ToBytes(b64: string): Uint8Array {
  const normalized = b64
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  const s = atob(padded);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iter: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations: iter,
    },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export interface PasswordValidationError {
  code: "too_short" | "too_long" | "too_common";
  message: string;
}

/**
 * Проверить пароль на соответствие политике.
 * Возвращает null если ok, иначе — структура ошибки.
 */
export function validatePasswordStrength(
  password: string,
): PasswordValidationError | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return {
      code: "too_short",
      message: `Password must be at least ${PASSWORD_MIN.toString()} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX) {
    return {
      code: "too_long",
      message: `Password must be at most ${PASSWORD_MAX.toString()} characters.`,
    };
  }
  const lower = password.toLowerCase();
  for (const weak of PASSWORD_BLACKLIST) {
    if (lower.includes(weak)) {
      return {
        code: "too_common",
        message: "Password is too common. Choose something less guessable.",
      };
    }
  }
  return null;
}

/**
 * Захэшировать пароль для хранения в auth_methods.secret_hash.
 * Каждый вызов генерит новую salt → результат недетерминирован.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return `${ALG}$${ITERATIONS.toString()}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

/**
 * Проверить пароль против сохранённого хэша.
 * Constant-time comparison не нужен — derived hash сравнивается через
 * собственное вычисление, любой timing-leak ограничен PBKDF2 iter,
 * который доминирует.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [alg, iterStr, saltB64, hashB64] = parts;
  if (alg !== ALG) return false;          // alg-mismatch → reject

  const iter = parseInt(iterStr, 10);
  if (!Number.isFinite(iter) || iter < 1) return false;

  const salt = b64ToBytes(saltB64);
  const expected = b64ToBytes(hashB64);
  if (expected.length !== HASH_BYTES) return false;

  const fresh = await deriveBits(password, salt, iter);
  if (fresh.length !== expected.length) return false;

  // Constant-time byte compare (defence-in-depth, хоть и не критично)
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= fresh[i] ^ expected[i];
  }
  return diff === 0;
}
