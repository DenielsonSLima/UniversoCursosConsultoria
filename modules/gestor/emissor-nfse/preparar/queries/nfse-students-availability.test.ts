import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { nfseStudentKeys } from './nfse-students.keys';
import { nfseQueueRealtimeTargets } from '../../fila/nfse-queue.realtime';
import { invalidateNfseCache } from '../../queries/nfse-cache';
import { defaultNfseReceiptFilters } from '../types/nfse-students.types';
import type { NfseScope } from '../../types/nfse.types';

test('confirmed operation hints refresh monthly receipt availability without crossing authority or polling', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const scope: NfseScope = { contextKey: 'context-synthetic', poloId: 'polo-synthetic', environment: 'PRODUCAO', month: '2026-12' };
  const receipt = { contextId: scope.contextKey, poloId: scope.poloId, environment: scope.environment, paymentMonth: '2026-11' };
  const key = nfseStudentKeys.groups(receipt, defaultNfseReceiptFilters());
  const protectedKeys = [
    nfseStudentKeys.groups({ ...receipt, environment: 'HOMOLOGACAO' }, defaultNfseReceiptFilters()),
    nfseStudentKeys.groups({ ...receipt, poloId: 'different-polo' }, defaultNfseReceiptFilters()),
    nfseStudentKeys.groups({ ...receipt, contextId: 'different-context' }, defaultNfseReceiptFilters()),
  ];
  let released = false, reads = 0;
  const observer = new QueryObserver(client, { queryKey: key, queryFn: async () => { reads++; return { available: released }; } });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await observer.refetch();
    protectedKeys.forEach(key => client.setQueryData(key, { protected: true }));
    assert.equal(client.getQueryData<{ available: boolean }>(key)?.available, false);
    released = true;
    const hint = { new: { version: 1, polo_id: scope.poloId, environment: scope.environment, month: '2026-10' } };
    await Promise.all(nfseQueueRealtimeTargets(hint, scope).map(queryKey => client.invalidateQueries({ queryKey })));
    assert.equal(client.getQueryData<{ available: boolean }>(key)?.available, true);
    assert.equal(reads, 2);
    for (const protectedKey of protectedKeys) assert.equal(client.getQueryState(protectedKey)?.isInvalidated, false);
    released = false;
    await invalidateNfseCache(client, scope, 'operations');
    assert.equal(client.getQueryData<{ available: boolean }>(key)?.available, false);
    assert.equal(reads, 3);
  } finally { unsubscribe(); client.clear(); }
});
