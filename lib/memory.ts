import { getRedis } from "./redis";

export type ChatTurn = { role: "user" | "assistant"; content: string };

const MAX_TURNS = 6; // last 3 exchanges (user+assistant each)
const TTL_SECONDS = 30 * 60; // conversation context expires after 30 min idle

export async function getHistory(userId: string): Promise<ChatTurn[]> {
  const redis = getRedis();
  const raw = await redis.lrange(`history:${userId}`, 0, -1);
  return raw
    .map((r) => {
      try {
        return JSON.parse(r) as ChatTurn;
      } catch {
        return null;
      }
    })
    .filter((t): t is ChatTurn => t !== null);
}

export async function appendHistory(userId: string, turn: ChatTurn): Promise<void> {
  const redis = getRedis();
  const key = `history:${userId}`;
  const pipeline = redis.pipeline();
  pipeline.rpush(key, JSON.stringify(turn));
  pipeline.ltrim(key, -MAX_TURNS, -1);
  pipeline.expire(key, TTL_SECONDS);
  await pipeline.exec();
}
