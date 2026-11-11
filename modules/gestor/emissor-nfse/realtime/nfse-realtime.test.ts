import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import type { QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NfseScope } from '../types/nfse.types';
import { nfseRealtimeTargets } from './nfse.realtime';
import { nfseQueueRealtimeTargets } from '../fila/nfse-queue.realtime';
import { nfseCacheTargets, nfseMetadataKeys } from '../queries/nfse-cache';
import { nfseModelsKeys } from '../modelos/queries/nfse-models.keys';
import { subscribeNfseChanges } from './nfse-subscription';

const scope: NfseScope = { contextKey: 'synthetic-context', poloId: '00000000-0000-0000-0000-000000000001', environment: 'PRODUCAO', month: '2026-11' };
const event = (resource: string, overrides = {}) => ({ new: { version: 1, polo_id: scope.poloId,
  environment: scope.environment, month: null, resource, ...overrides } });

test('global model/config/catalog events invalidate their actual query families without crossing authority', () => {
  assert.deepEqual(nfseRealtimeTargets(event('models'), scope), nfseCacheTargets(scope, 'models'));
  assert.deepEqual(nfseRealtimeTargets(event('models'), scope)[0], nfseModelsKeys.scope(scope));
  assert.deepEqual(nfseRealtimeTargets(event('configuration'), scope), nfseCacheTargets(scope, 'configuration'));
  assert.deepEqual(nfseRealtimeTargets(event('cancellation-models'), scope), [nfseMetadataKeys.cancellationModels(scope)]);
  for (const overrides of [{ polo_id: 'another-polo' }, { environment: 'HOMOLOGACAO' }, { version: 2 }, { month: '2026-10' }]) {
    assert.deepEqual(nfseRealtimeTargets(event('models', overrides), scope), []);
  }
  assert.deepEqual(nfseRealtimeTargets(event('services'), scope), []);
  assert.deepEqual(nfseRealtimeTargets(event('services', { month: scope.month }), scope), nfseCacheTargets(scope, 'services'));
  assert.notDeepEqual(nfseCacheTargets(scope, 'models'), nfseCacheTargets({ ...scope, contextKey: 'another-actor' }, 'models'));
});

test('operation events refresh public projections and numbering, preserving unrelated months', () => {
  assert.deepEqual(nfseQueueRealtimeTargets(event('unused', { month: scope.month }), scope), nfseCacheTargets(scope, 'operations'));
  assert.deepEqual(nfseQueueRealtimeTargets(event('unused', { month: '2026-10' }), scope), [nfseMetadataKeys.numbering(scope)]);
  assert.deepEqual(nfseQueueRealtimeTargets(event('unused', { month: 'invalid' }), scope), []);
  assert.deepEqual(nfseQueueRealtimeTargets(event('unused', { month: scope.month, environment: 'HOMOLOGACAO' }), scope), []);
});

function fixture() {
  const calls: { queryKey: readonly unknown[]; refetchType?: string }[] = [];
  let callback: (payload: unknown) => void = () => {};
  let status: (status: string) => void = () => {};
  let removed = 0;
  const channel = {
    on(_type: string, binding: { table: string; filter: string }, fn: typeof callback) {
      assert.equal(binding.table, 'nfse_change_events'); assert.equal(binding.filter, `polo_id=eq.${scope.poloId}`);
      callback = fn; return channel;
    },
    subscribe(fn: typeof status) { status = fn; return channel; },
  };
  const supabase = { channel: () => channel, removeChannel: () => { removed++; return Promise.resolve('ok'); } };
  const client = { invalidateQueries: async (input: typeof calls[number]) => { calls.push(input); } };
  const cleanup = subscribeNfseChanges(supabase as unknown as SupabaseClient, client as unknown as QueryClient,
    'synthetic-channel', [{ table: 'nfse_change_events', filter: `polo_id=eq.${scope.poloId}`,
      targets: payload => nfseRealtimeTargets(payload, scope) }], nfseCacheTargets(scope, 'models'));
  return { calls, cleanup, emit: (payload: unknown) => callback(payload), status: (value: string) => status(value), removed: () => removed };
}

test('subscribe/reconnect coalesces refresh, channel failures mark stale without polling or commands', async () => {
  const f = fixture();
  f.status('SUBSCRIBED'); f.emit(event('models')); f.emit(event('models'));
  await wait(180);
  assert.equal(f.calls.length, nfseCacheTargets(scope, 'models').length);
  f.calls.length = 0;
  f.status('CHANNEL_ERROR');
  assert.equal(f.calls.every(call => call.refetchType === 'none'), true);
  f.calls.length = 0;
  f.status('SUBSCRIBED'); await wait(180);
  assert.equal(f.calls.length, nfseCacheTargets(scope, 'models').length);
  f.cleanup(); assert.equal(f.removed(), 1);
});

test('cleanup discards queued events and stale callbacks after scope change/unmount', async () => {
  const f = fixture();
  f.emit(event('models')); f.cleanup(); f.emit(event('models')); f.status('SUBSCRIBED');
  await wait(180);
  assert.deepEqual(f.calls, []); assert.equal(f.removed(), 1);
});
