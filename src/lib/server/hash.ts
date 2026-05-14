/*
 * Hash utilities — SHA-256 helpers через Web Crypto API.
 *
 * Используются для:
 *   - JWT fingerprinting (createFingerprint) — кладётся в `fp` claim
 *     JWT и валидируется при каждом verify против текущего IP+UA.
 *   - GDPR-safe IP storage (hashIp) — пишется в auth_sessions.ip_hash
 *     и audit_log.ip_hash. Plaintext IP никогда не хранится.
 *
 * Разница в "соли":
 *   - createFingerprint(ip, ua) — БЕЗ соли. Хэш лежит в JWT payload
 *     (signed), наружу не утекает. Атакующий который держит JWT не
 *     может его подделать (нет signing key) → recompute fp с подменой
 *     IP+UA невозможен.
 *   - hashIp(ip, salt=env.IP_HASH_SALT) — С солью. Хэш может оказаться
 *     в дампе БД при breach; без соли атакующий легко enumerate'нет
 *     IP-адреса перебором (rainbow-table по диапазону IPv4 ~4B).
 *     С 32-байтной солью enumeration становится дорогим (требует
 *     утечки и БД, и MASTER-config'а).
 */

const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Создать fingerprint из IP + UA для JWT `fp` claim.
 * Не использует соль — хэш лежит внутри signed JWT, не утекает наружу.
 */
export async function createFingerprint(ip: string, ua: string): Promise<string> {
  return sha256Hex(`${ip}:${ua}`);
}

/**
 * Сравнить сохранённый fp claim с текущим request.
 * Constant-time comparison не требуется — fp лежит в signed JWT,
 * атакующий не может подменить его без signing key.
 */
export async function verifyFingerprint(
  storedFp: string,
  currentIp: string,
  currentUa: string,
): Promise<boolean> {
  const fresh = await createFingerprint(currentIp, currentUa);
  return storedFp === fresh;
}

/**
 * GDPR-safe IP hash — для хранения в БД (auth_sessions / audit_log).
 * Plaintext IP никогда не записывается. Salt — env.IP_HASH_SALT.
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  return sha256Hex(`${ip}:${salt}`);
}

/**
 * Достать IP + User-Agent из Astro request.
 * Cloudflare предоставляет CF-Connecting-IP — это правильный IP клиента
 * с учётом всех своих proxy. Fallback'и для edge-кейсов / local dev.
 */
export function extractRequestInfo(request: Request): { ip: string; ua: string } {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0";
  const ua = request.headers.get("user-agent") ?? "unknown";
  return { ip, ua };
}
