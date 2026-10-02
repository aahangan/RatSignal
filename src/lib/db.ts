import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";

// Tiny key-value store. Production uses Upstash Redis (Vercel Marketplace); local dev falls
// back to a JSON file so the app runs with zero setup.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

if (!redis && process.env.VERCEL) {
  throw new Error("Upstash Redis is not configured. Add it from the Vercel Marketplace.");
}

type FileStore = { kv: Record<string, unknown>; sets: Record<string, string[]>; counters: Record<string, { n: number; exp: number }> };
const FILE = path.join(process.cwd(), ".data", "db.json");
let queue: Promise<unknown> = Promise.resolve();

async function withFile<T>(fn: (s: FileStore) => T | Promise<T>, write = false): Promise<T> {
  const run = queue.then(async () => {
    let store: FileStore;
    try {
      store = JSON.parse(await fs.readFile(FILE, "utf8"));
    } catch {
      store = { kv: {}, sets: {}, counters: {} };
    }
    const result = await fn(store);
    if (write) {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(store, null, 2));
    }
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export const db = {
  async get<T>(key: string): Promise<T | null> {
    if (redis) return redis.get<T>(key);
    return withFile((s) => (s.kv[key] as T) ?? null);
  },

  async set(key: string, value: unknown) {
    if (redis) return void (await redis.set(key, value));
    await withFile((s) => void (s.kv[key] = value), true);
  },

  /** Sets only if the key is empty. Returns true if this call claimed it. */
  async claim(key: string, value: string): Promise<boolean> {
    if (redis) return (await redis.set(key, value, { nx: true })) === "OK";
    return withFile((s) => {
      if (s.kv[key] !== undefined) return false;
      s.kv[key] = value;
      return true;
    }, true);
  },

  async del(key: string) {
    if (redis) return void (await redis.del(key));
    await withFile((s) => void delete s.kv[key], true);
  },

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return [];
    if (redis) return redis.mget<(T | null)[]>(...keys);
    return withFile((s) => keys.map((k) => (s.kv[k] as T) ?? null));
  },

  async sadd(key: string, member: string) {
    if (redis) return void (await redis.sadd(key, member));
    await withFile((s) => {
      const set = new Set(s.sets[key] ?? []);
      set.add(member);
      s.sets[key] = [...set];
    }, true);
  },

  async srem(key: string, member: string) {
    if (redis) return void (await redis.srem(key, member));
    await withFile((s) => void (s.sets[key] = (s.sets[key] ?? []).filter((m) => m !== member)), true);
  },

  async smembers(key: string): Promise<string[]> {
    if (redis) return redis.smembers(key);
    return withFile((s) => s.sets[key] ?? []);
  },

  /** Increments a counter that expires `ttlSeconds` after it's first created. */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (redis) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, ttlSeconds);
      return n;
    }
    return withFile((s) => {
      const c = s.counters[key];
      const live = c && c.exp > Date.now() ? c : { n: 0, exp: Date.now() + ttlSeconds * 1000 };
      live.n += 1;
      s.counters[key] = live;
      return live.n;
    }, true);
  },
};

/** Fixed-window rate limit: false once `limit` hits were made within the window. */
export async function allow(key: string, limit: number, windowSeconds: number) {
  return (await db.incr(`rl:${key}`, windowSeconds)) <= limit;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
