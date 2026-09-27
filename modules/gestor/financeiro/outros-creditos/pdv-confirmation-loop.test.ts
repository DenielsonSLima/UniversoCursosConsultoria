import assert from 'node:assert/strict';
import test from 'node:test';
import { startPdvConfirmation } from './pdv-confirmation-loop';
import type { OtherCreditPayment } from './other-credit-payment.service';

const data = (status = 'PENDENTE', retryAfterMs = 15_000): OtherCreditPayment => ({
  payment: { id: 'title', status }, customerName: '', canPay: true, canRefresh: true,
  boletoAvailable: true, pixState: 'available', needsReview: false,
  confirmation: { status: 'CHECKED', reason: 'PENDING', checkedAt: null, nextCheckAt: null, retryAfterMs },
});
function harness(check: (signal: AbortSignal) => Promise<OtherCreditPayment>) {
  let time = 0; let active = true;
  const timers = new Map<number, { due: number; fn: () => void }>(); let id = 0;
  const received: OtherCreditPayment[] = [];
  const stop = startPdvConfirmation({ check, onData: d => { received.push(d); }, active: () => active,
    now: () => time,
    setTimer: ((fn: () => void, delay: number) => { timers.set(++id, { due: time + delay, fn }); return id; }) as unknown as typeof setTimeout,
    clearTimer: ((key: number) => { timers.delete(key); }) as unknown as typeof clearTimeout,
  });
  return { stop, received, hide: () => { active = false; }, show: () => { active = true; },
    nextDelay: () => Math.min(...[...timers.values()].map(t => t.due - time)),
    tick: async () => {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) return;
      time = next[1].due; timers.delete(next[0]); next[1].fn();
      await Promise.resolve(); await Promise.resolve();
    },
  };
}

test('aguarda retorno antes de reagendar e respeita cooldown informado no servidor', async () => {
  let calls = 0;
  const s = harness(async () => { calls += 1; return data('PENDENTE', 90_000); });
  await s.tick(); assert.equal(calls, 1); assert.equal(s.nextDelay(), 90_000);
  s.stop(); await s.tick(); assert.equal(calls, 1);
});
test('aba oculta/offline não consulta e pagamento final encerra o loop', async () => {
  let calls = 0;
  const s = harness(async () => { calls += 1; return data('PAGO'); });
  s.hide(); await s.tick(); assert.equal(calls, 0);
  s.show(); await s.tick(); assert.equal(calls, 1); assert.equal(s.received[0].payment.status, 'PAGO');
  await s.tick(); assert.equal(calls, 1);
});
test('falhas usam espera progressiva e STOPPED não volta a consultar', async () => {
  const s = harness(async () => { throw new Error('offline'); });
  await s.tick(); assert.equal(s.nextDelay(), 30_000);
  await s.tick(); assert.equal(s.nextDelay(), 60_000);
  s.stop();
  let calls = 0;
  const stopped = harness(async () => { calls += 1; return { ...data(), confirmation: { ...data().confirmation!, status: 'STOPPED' } }; });
  await stopped.tick(); await stopped.tick(); assert.equal(calls, 1);
});
test('desmontagem aborta pedido e ignora resposta tardia', async () => {
  let resolve!: (d: OtherCreditPayment) => void;
  let signal!: AbortSignal;
  const s = harness(sg => { signal = sg; return new Promise(r => { resolve = r; }); });
  await s.tick(); s.stop(); assert.equal(signal.aborted, true);
  resolve(data('PAGO')); await Promise.resolve(); await Promise.resolve();
  assert.equal(s.received.length, 0);
});
test('atendimento expira sem polling permanente', async () => {
  let calls = 0;
  const s = harness(async () => { calls += 1; return data(); });
  for (let i = 0; i < 100; i += 1) await s.tick();
  assert.equal(calls, 40);
});
