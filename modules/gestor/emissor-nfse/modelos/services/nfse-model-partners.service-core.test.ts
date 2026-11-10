import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseModelPartnerService } from './nfse-model-partners.service-core';
import { NfseContractError } from '../../services/nfse.errors';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO' as const, month: '2026-11' };
const envelope = (rows: unknown[], echo = scope) => ({ version: 1, scope: echo,
  data: { rows, page: 1, pageSize: 20, totalItems: rows.length } });

test('partner lookup is bounded, scoped, abortable and sends only search or reference id', async () => {
  let calls = 0;
  const signal = new AbortController().signal;
  const service = createNfseModelPartnerService(async (name, args, received) => {
    calls++;
    assert.equal(name, 'search_nfse_model_partners_secure');
    assert.deepEqual(args, { p_context_key: id(1), p_polo_id: id(2), p_environment: 'HOMOLOGACAO',
      p_month: '2026-11', p_search: 'Par', p_partner_id: null });
    assert.equal(received, signal);
    return envelope([{ id: id(3), label: 'Parceiro de teste' }]);
  });
  assert.deepEqual(await service.search(scope, 'x'), []);
  assert.equal(calls, 0);
  assert.deepEqual(await service.search(scope, ' Par ', null, signal), [{ value: id(3), label: 'Parceiro de teste' }]);
});

test('lookup rejects scope drift, duplicate references, unknown selected identity and oversized input', async () => {
  for (const response of [envelope([{ id: id(4), label: 'Outro' }]),
    envelope([{ id: id(3), label: 'Um' }, { id: id(3), label: 'Duplicado' }]),
    envelope([], { ...scope, poloId: id(8) })]) {
    const service = createNfseModelPartnerService(async () => response);
    await assert.rejects(service.search(scope, '', id(3)), NfseContractError);
  }
  const service = createNfseModelPartnerService(async () => { throw Error('Unexpected request'); });
  await assert.rejects(service.search(scope, 'a'.repeat(101)), NfseContractError);
  await assert.rejects(service.search(scope, 'ab', 'invalid'), NfseContractError);
});
