import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __redisClient: Redis | undefined;
}

// Reuse a single connection across warm serverless invocations instead of
// opening a new one per request.
export function getRedis(): Redis {
  if (!global.__redisClient) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set");
    }
    const client = new Redis(url, { maxRetriesPerRequest: 2 });
    client.on("error", (err) => {
      console.error("[redis] connection error:", err);
    });
    global.__redisClient = client;
  }
  return global.__redisClient;
}
