/**
 * Простой rate-limit в памяти процесса: защита от перебора паролей.
 * Для self-host на одном сервере этого достаточно; на нескольких инстансах
 * лимит на каждый инстанс свой (всё равно резко ограничивает брутфорс).
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 5 * 60 * 1000; // 5 минут
const MAX_ATTEMPTS = 8;

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_ATTEMPTS) return false;
  b.count += 1;
  return true;
}

// Чистка протухших корзин, чтобы память не росла бесконечно.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, WINDOW_MS);
cleanup.unref?.();
