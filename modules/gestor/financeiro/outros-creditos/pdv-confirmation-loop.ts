import type { OtherCreditPayment } from './other-credit-payment.service';

export interface PdvConfirmationOptions {
  check: (signal: AbortSignal) => Promise<OtherCreditPayment>;
  onData: (data: OtherCreditPayment) => void | Promise<void>;
  active: () => boolean;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

/** Serial foreground checks; bank authorization, budget and cadence stay server-side. */
export function startPdvConfirmation(options: PdvConfirmationOptions) {
  const now = options.now ?? Date.now;
  const schedule = options.setTimer ?? setTimeout;
  const cancel = options.clearTimer ?? clearTimeout;
  const expiresAt = now() + 10 * 60_000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let failures = 0;
  const later = (delay: number) => {
    if (!stopped && now() < expiresAt) timer = schedule(() => { void tick(); }, delay);
  };
  const tick = async () => {
    if (stopped || now() >= expiresAt) return;
    if (!options.active()) { later(15_000); return; }
    controller = new AbortController();
    const timeout = schedule(() => controller?.abort(), 20_000);
    let delay: number;
    try {
      const data = await options.check(controller.signal);
      if (stopped) return;
      await options.onData(data);
      if (stopped) return;
      failures = 0;
      if (data.confirmation?.status === 'STOPPED'
        || !['PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO'].includes(String(data.payment.status))) {
        stopped = true;
        return;
      }
      const requested = data.confirmation?.retryAfterMs;
      delay = typeof requested === 'number' && Number.isFinite(requested)
        ? Math.max(15_000, requested) : 30_000;
    } catch {
      failures += 1;
      delay = Math.min(120_000, 30_000 * 2 ** Math.min(2, failures - 1));
    } finally {
      cancel(timeout);
      controller = undefined;
    }
    later(delay);
  };
  later(0);
  return () => { stopped = true; if (timer) cancel(timer); controller?.abort(); };
}
