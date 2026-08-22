import type { ConnectionOptions } from 'bullmq';

/**
 * BullMQ/ioredis do not accept a Redis URL string as `connection`.
 * Passing a string is ignored and ioredis falls back to 127.0.0.1:6379.
 */
export function getRedisConnection(
  env: NodeJS.ProcessEnv = process.env,
): ConnectionOptions {
  const redisUrl = env.REDIS_URL || env.REDIS_PRIVATE_URL;

  if (redisUrl) {
    const parsed = new URL(redisUrl);
    const isLocal =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: decodeURIComponent(parsed.username) || undefined,
      password: decodeURIComponent(parsed.password) || undefined,
      // Railway private DNS (*.railway.internal) is IPv6-first.
      family: isLocal ? 4 : 0,
      maxRetriesPerRequest: null,
    };
  }

  const host = env.REDIS_HOST || 'localhost';
  const port = Number(env.REDIS_PORT || 6379);
  const password = env.REDIS_PASSWORD;
  const username =
    env.REDIS_USERNAME || env.REDISUSER || (password ? 'default' : undefined);
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  return {
    host,
    port,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    family: isLocal ? 4 : 0,
    maxRetriesPerRequest: null,
  };
}
