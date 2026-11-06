import { Redis } from "ioredis";
import { env } from "../config/env";

// BullMQ exige maxRetriesPerRequest = null nas conexões de worker.
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
}
