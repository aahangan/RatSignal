import { describe, expect, it, vi } from "vitest";
import { HttpError, isRetryable, withRetry } from "./retry";

const noSleep = { sleep: async () => {} };

describe("withRetry", () => {
  it("retries server errors and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new HttpError(503, "down")).mockRejectedValueOnce(new HttpError(429, "slow")).mockResolvedValue("ok");
    await expect(withRetry(fn, noSleep)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(400, "bad query"));
    await expect(withRetry(fn, noSleep)).rejects.toThrow("bad query");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry limit", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network"));
    await expect(withRetry(fn, { ...noSleep, retries: 2 })).rejects.toThrow("network");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("waits longer each attempt, up to the cap", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("x"));
    await withRetry(fn, { retries: 4, baseMs: 100, maxMs: 500, sleep: async (ms) => void delays.push(ms) }).catch(() => {});
    expect(delays).toHaveLength(4);
    expect(delays[1]).toBeGreaterThan(delays[0] * 1.2);
    expect(Math.max(...delays)).toBeLessThanOrEqual(500 * 1.25);
  });

  it("classifies errors", () => {
    expect(isRetryable(new HttpError(500, ""))).toBe(true);
    expect(isRetryable(new HttpError(404, ""))).toBe(false);
    expect(isRetryable(new TypeError("fetch failed"))).toBe(true);
  });
});
