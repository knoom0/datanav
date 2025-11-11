import "server-only";
import { createClient, RedisClientType } from "redis";

import { getConfig } from "@/lib/config";
import logger from "@/lib/logger";

/**
 * Create a new Redis client
 * Each call creates a fresh client connection
 * 
 * IMPORTANT: Caller is responsible for calling client.quit() when done to clean up the connection
 */
export async function getRedisClient(): Promise<RedisClientType> {
  // Create Redis client
  const config = getConfig();
  const client = createClient({
    url: config.redis.url,
  });

  // Set up error handling
  client.on("error", (err) => {
    logger.error(err, "Redis client error");
  });

  client.on("connect", () => {
    logger.info("Redis client connected");
  });

  client.on("reconnecting", () => {
    logger.info("Redis client reconnecting");
  });

  client.on("ready", () => {
    logger.info("Redis client ready");
  });

  // Connect the client
  await client.connect();

  return client as RedisClientType;
}

/**
 * Redis stream key for agent session message chunks
 */
export function getSessionStreamKey(params: { sessionId: string }): string {
  return `session:${params.sessionId}:stream`;
}
