import { getRedis } from "./redis";

const WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 5;
const COOLDOWN_MS = 30_000;

export const RATE_LIMIT_REPLY =
  "ขอโทษครับ ตอนนี้มีข้อความเข้ามาถี่เกินไป รบกวนรอสักครู่แล้วลองใหม่นะครับ 🙏";

export type RateLimitResult = "ok" | "warn" | "silent";

// Redis-backed sliding window + cooldown flag, shared across all serverless
// instances so it actually holds up under concurrent invocations.
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowKey = `ratelimit:window:${userId}`;
  const cooldownKey = `ratelimit:cooldown:${userId}`;

  const cooldownActive = await redis.get(cooldownKey);
  if (cooldownActive) {
    return "silent";
  }

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(windowKey, 0, now - WINDOW_MS);
  pipeline.zadd(windowKey, now, `${now}-${Math.random()}`);
  pipeline.zcard(windowKey);
  pipeline.pexpire(windowKey, WINDOW_MS);
  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  if (count > MAX_MESSAGES_PER_WINDOW) {
    await redis.set(cooldownKey, "1", "PX", COOLDOWN_MS);
    return "warn";
  }

  return "ok";
}
