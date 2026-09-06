/** Judge-mode 60s scripted demo tour — non-blocking, cancellable. */

export type TourStep = {
  id: string;
  /** Delay before this step (ms) from previous */
  waitMs: number;
  label: string;
  run: () => void | Promise<void>;
};

export type TourController = {
  cancel: () => void;
  running: () => boolean;
};

export async function runTour(
  steps: TourStep[],
  onStatus?: (label: string, index: number, total: number) => void,
): Promise<'done' | 'cancelled'> {
  const ctrl: { cancelled: boolean } = { cancelled: false };

  (runTour as unknown as { _ctrl?: { cancelled: boolean } })._ctrl = ctrl;

  for (let i = 0; i < steps.length; i++) {
    if (ctrl.cancelled) return 'cancelled';
    const step = steps[i];
    onStatus?.(step.label, i, steps.length);
    await sleep(step.waitMs, () => ctrl.cancelled);
    if (ctrl.cancelled) return 'cancelled';
    await step.run();
  }
  onStatus?.('Demo complete', steps.length, steps.length);
  return 'done';
}

export function cancelTour(): void {
  const ctrl = (runTour as unknown as { _ctrl?: { cancelled: boolean } })._ctrl;
  if (ctrl) ctrl.cancelled = true;
}

function sleep(ms: number, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (isCancelled() || Date.now() - start >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, 50);
    };
    setTimeout(tick, Math.min(50, ms));
  });
}
