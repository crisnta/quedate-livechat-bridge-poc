import { afterEach, expect, it, vi } from "vitest";
import { startPolling, type Visibility } from "../src/lib/operations/polling";
function visibility(hidden = false) {
  const listeners = new Set<() => void>();
  return {
    hidden,
    addEventListener: (_: string, f: () => void) => {
      listeners.add(f);
    },
    removeEventListener: (_: string, f: () => void) => {
      listeners.delete(f);
    },
    change(value: boolean) {
      this.hidden = value;
      listeners.forEach((f) => f());
    },
  } satisfies Visibility & { change: (v: boolean) => void };
}
afterEach(() => vi.useRealTimers());
it("runs once immediately and repeats only after five seconds", async () => {
  vi.useFakeTimers();
  const run = vi.fn(async () => {});
  const stop = startPolling(run, visibility());
  await vi.advanceTimersByTimeAsync(4999);
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(10000);
  expect(run).toHaveBeenCalledTimes(2);
});
it("does not query hidden tabs and resumes when visible", async () => {
  vi.useFakeTimers();
  const v = visibility(true),
    run = vi.fn(async () => {});
  const stop = startPolling(run, v);
  await vi.advanceTimersByTimeAsync(10000);
  expect(run).not.toHaveBeenCalled();
  v.change(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(run).toHaveBeenCalledTimes(1);
  v.change(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(run).toHaveBeenCalledTimes(1);
  stop();
});
it("never overlaps requests and aborts on visibility change or stop", async () => {
  vi.useFakeTimers();
  const v = visibility();
  let release!: () => void;
  let signal!: AbortSignal;
  const run = vi.fn(async (s: AbortSignal) => {
    signal = s;
    await new Promise<void>((r) => {
      release = r;
    });
  });
  const stop = startPolling(run, v);
  await vi.advanceTimersByTimeAsync(20000);
  expect(run).toHaveBeenCalledTimes(1);
  v.change(true);
  expect(signal.aborted).toBe(true);
  release();
  await vi.advanceTimersByTimeAsync(0);
  v.change(false);
  expect(run).toHaveBeenCalledTimes(2);
  stop();
  expect(signal.aborted).toBe(true);
  release();
});
it("backs off after errors and returns to the normal interval on success", async () => {
  vi.useFakeTimers();
  const error = vi.fn(),
    run = vi
      .fn()
      .mockRejectedValueOnce(new Error("synthetic"))
      .mockResolvedValue(undefined);
  const stop = startPolling(run, visibility(), { onError: error });
  await vi.advanceTimersByTimeAsync(9999);
  expect(run).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).toHaveBeenCalledTimes(3);
  stop();
});
