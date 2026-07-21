import { getRedis } from "./redis";

const QUEUE_KEY = "staff-queue";
const ENTRY_TTL_MS = 30 * 60 * 1000; // treat someone as "still waiting" for at most 30 min
const AVG_MINUTES_PER_CUSTOMER = 5;

export type QueueStatus = {
  position: number;
  estimatedWaitMinutes: number;
};

// Sorted set of userId -> timestamp joined. Position is rank among entries
// still within the TTL window, giving a rough but real "people ahead of you"
// count instead of a static canned message.
export async function joinQueue(userId: string): Promise<QueueStatus> {
  const redis = getRedis();
  const now = Date.now();

  await redis.zremrangebyscore(QUEUE_KEY, 0, now - ENTRY_TTL_MS);
  await redis.zadd(QUEUE_KEY, now, userId);

  const rank = await redis.zrank(QUEUE_KEY, userId);
  const position = (rank ?? 0) + 1;
  const estimatedWaitMinutes = Math.max(1, (position - 1) * AVG_MINUTES_PER_CUSTOMER + 1);

  return { position, estimatedWaitMinutes };
}
