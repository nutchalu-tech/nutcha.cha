const WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 5;
const COOLDOWN_MS = 30_000;

export const RATE_LIMIT_REPLY =
  "ขอโทษครับ ตอนนี้มีข้อความเข้ามาถี่เกินไป รบกวนรอสักครู่แล้วลองใหม่นะครับ 🙏";

type RateState = {
  timestamps: number[];
  warnedUntil: number;
};

// Best-effort, in-memory only -- resets whenever the serverless instance
// cold-starts. Good enough to stop a runaway loop from one user hammering
// the bot within a single warm instance; not a hard guarantee across scale.
const state = new Map<string, RateState>();

export type RateLimitResult = "ok" | "warn" | "silent";

export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const entry = state.get(userId) ?? { timestamps: [], warnedUntil: 0 };

  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
  entry.timestamps.push(now);
  state.set(userId, entry);

  if (entry.timestamps.length <= MAX_MESSAGES_PER_WINDOW) {
    return "ok";
  }

  if (now < entry.warnedUntil) {
    return "silent";
  }

  entry.warnedUntil = now + COOLDOWN_MS;
  return "warn";
}
