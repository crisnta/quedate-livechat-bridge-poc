export type Visibility = {
  hidden: boolean;
  addEventListener: (event: string, listener: () => void) => void;
  removeEventListener: (event: string, listener: () => void) => void;
};
// Injectable scheduler so timing, pause, overlap and hidden-tab behavior are testable.
export function startPolling(
  run: (signal: AbortSignal) => Promise<void>,
  visibility: Visibility,
  options: { interval?: number; onError?: () => void } = {},
) {
  let stopped = false,
    running = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    controller: AbortController | undefined,
    failures = 0;
  const interval = options.interval ?? 5000;
  function schedule() {
    if (!stopped && !visibility.hidden)
      timer = setTimeout(tick, Math.min(60000, interval * 2 ** failures));
  }
  async function tick() {
    timer = undefined;
    if (stopped || visibility.hidden || running) return;
    running = true;
    controller = new AbortController();
    try {
      await run(controller.signal);
      failures = 0;
    } catch {
      if (!controller.signal.aborted) {
        failures = Math.min(failures + 1, 4);
        options.onError?.();
      }
    } finally {
      running = false;
      schedule();
    }
  }
  function changed() {
    if (timer) clearTimeout(timer);
    if (visibility.hidden) controller?.abort();
    else if (!running && !stopped) void tick();
  }
  visibility.addEventListener("visibilitychange", changed);
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller?.abort();
    visibility.removeEventListener("visibilitychange", changed);
  };
}
