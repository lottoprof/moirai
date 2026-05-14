/*
 * AES-GCM 256 encrypt/decrypt через Web Crypto API (нативно в CF Workers).
 *
 * Используется для:
 *   - jwt_keys.secret_encrypted (sign keys в БД, decryptable только с MASTER_SECRET)
 *   - Любых других at-rest secrets которые класть в БД целиком.
 *
 * Стратегия ключа:
 *   plaintext_master_secret_string (env.MASTER_SECRET, ~44 base64 chars)
 *     → sha256(string)
 *     → 32-byte AES-GCM key
 *
 * Простая схема (без HKDF) — порт из ~/git/301/src/api/lib/crypto.ts.
 * Если когда-нибудь понадобится derivation per-purpose — добавим HKDF
 * слой без breaking change wire-формата (через `ver` поле).
 *
 * Wire-формат для at-rest хранения:
 *   { iv: base64, ct: base64, ver: "v1" }
 * `ver` нужен для миграции если поменяем алгоритм/derivation.
 * AES-GCM auth tag inlined в ciphertext (Web Crypto convention).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const KEY_VERSION = "v1";

export interface Encrypted {
  iv: string;
  ct: string;
  ver: string;
}

/** Hash MASTER_SECRET → 32-byte AES-GCM key. */
async function deriveAesKey(masterSecret: string): Promise<CryptoKey> {
  const hashed = await crypto.subtle.digest("SHA-256", enc.encode(masterSecret));
  return crypto.subtle.importKey(
    "raw",
    hashed,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Зашифровать строку через AES-GCM с производным ключом от MASTER_SECRET.
 * Если data — не строка, JSON-stringify сначала.
 */
export async function encrypt(
  data: unknown,
  masterSecret: string,
): Promise<Encrypted> {
  const plaintext = typeof data === "string" ? data : JSON.stringify(data);
  const iv = crypto.getRandomValues(new Uint8Array(12));    // 96-bit IV для GCM
  const key = await deriveAesKey(masterSecret);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext),
  );
  return {
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct)),
    ver: KEY_VERSION,
  };
}

/**
 * Расшифровать blob.
 * Возвращает либо JSON-парсенный объект (если plaintext — валидный
 * JSON), либо саму строку. Generic T — для type-safe wrapping.
 */
export async function decrypt<T = unknown>(
  payload: Encrypted,
  masterSecret: string,
): Promise<T> {
  if (payload.ver !== KEY_VERSION) {
    console.warn(
      `[crypto.decrypt] Version mismatch: encrypted=${payload.ver}, expected=${KEY_VERSION}`,
    );
    // Возможные будущие миграции — обработаем здесь when needed.
  }

  const iv = b64ToBytes(payload.iv);
  const ct = b64ToBytes(payload.ct);
  const key = await deriveAesKey(masterSecret);

  const ptBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  const text = dec.decode(ptBuffer);

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
