import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRealtimeInvalidationController,
  type RealtimeInvalidationClock,
} from './realtime-invalidation.ts';

const createManualClock = () => {
  let nextId = 0;
  const callbacks = new Map<number, () => void>();
  const clock: RealtimeInvalidationClock = {
    set: (callback) => {
      nextId += 1;
      callbacks.set(nextId, callback);
      return nextId;
    },
    clear: (handle) => callbacks.delete(handle as number),
  };

  return {
    clock,
    flush: () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback());
    },
    pendingCount: () => callbacks.size,
  };
};

test('agrupa evento duplicado e rajada em uma única invalidação', () => {
  const timer = createManualClock();
  let invalidations = 0;
  const controller = createRealtimeInvalidationController({
    clock: timer.clock,
    invalidate: () => { invalidations += 1; },
  });

  controller.schedule();
  controller.schedule();
  controller.schedule();

  assert.equal(timer.pendingCount(), 1);
  timer.flush();
  assert.equal(invalidations, 1);
});

test('primeiro SUBSCRIBED e reconnect refazem consulta de forma debounced', () => {
  const timer = createManualClock();
  let invalidations = 0;
  const controller = createRealtimeInvalidationController({
    clock: timer.clock,
    invalidate: () => { invalidations += 1; },
  });

  controller.onChannelStatus('SUBSCRIBED');
  assert.equal(timer.pendingCount(), 1);
  timer.flush();
  assert.equal(invalidations, 1);

  controller.onChannelStatus('SUBSCRIBED');
  controller.onChannelStatus('SUBSCRIBED');
  assert.equal(timer.pendingCount(), 1);
  timer.flush();
  assert.equal(invalidations, 2);
});

test('erros e fechamento de canal fazem fallback canônico sem tempestade', () => {
  const timer = createManualClock();
  let invalidations = 0;
  const controller = createRealtimeInvalidationController({
    clock: timer.clock,
    invalidate: () => { invalidations += 1; },
  });

  controller.onChannelStatus('CHANNEL_ERROR');
  controller.onChannelStatus('TIMED_OUT');
  controller.onChannelStatus('CLOSED');

  assert.equal(timer.pendingCount(), 1);
  timer.flush();
  assert.equal(invalidations, 1);
});

test('falha pontual de refetch não escapa do callback nem desativa o canal', async () => {
  const timer = createManualClock();
  let attempts = 0;
  const controller = createRealtimeInvalidationController({
    clock: timer.clock,
    invalidate: () => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('falha de rede'))
        : Promise.resolve();
    },
  });

  controller.schedule();
  timer.flush();
  await Promise.resolve();
  controller.schedule();
  timer.flush();
  await Promise.resolve();

  assert.equal(attempts, 2);
});

test('evento tardio após dispose é ignorado e timer pendente é cancelado', () => {
  const timer = createManualClock();
  let invalidations = 0;
  const controller = createRealtimeInvalidationController({
    clock: timer.clock,
    invalidate: () => { invalidations += 1; },
  });

  controller.schedule();
  controller.dispose();
  controller.schedule();
  controller.onChannelStatus('SUBSCRIBED');
  timer.flush();

  assert.equal(timer.pendingCount(), 0);
  assert.equal(invalidations, 0);
});

test('deleção remota usa o mesmo caminho canônico e nunca aplica payload ao cache', () => {
  const timer = createManualClock();
  let invalidations = 0;
  const controller = createRealtimeInvalidationController({
    clock: timer.clock,
    invalidate: () => { invalidations += 1; },
  });

  controller.schedule();
  timer.flush();

  assert.equal(invalidations, 1);
  assert.deepEqual(Object.keys(controller).sort(), ['dispose', 'onChannelStatus', 'schedule']);
});
