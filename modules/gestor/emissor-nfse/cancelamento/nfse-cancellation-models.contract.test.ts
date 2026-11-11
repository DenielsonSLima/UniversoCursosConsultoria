import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../types/nfse.types';
import { NfseContractError } from '../services/nfse.errors';
import { cancellationModelDefinition, createNfseCancellationModelsService, parseCancellationModel } from './nfse-cancellation-models.contract';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
const definition = { name: 'Erro no valor', category: 'VALOR' as const, active: true, eventCode: '101101' as const, reasonCode: '1' as const, textTemplate: 'Solicito cancelar por erro no valor: {{detalhe}}.' };
const system = { ...definition, id: 'SYSTEM:ERROR_AMOUNT', version: 1, source: 'SYSTEM', requiresDetail: true };
const envelope = (data: unknown, echo = scope) => ({ version: 1, scope: echo, data });

test('formal catalogue preserves canonical system models and strips unexpected fields', async () => {
  const service = createNfseCancellationModelsService(async (name, args) => {
    assert.equal(name, 'get_nfse_cancellation_models_secure'); assert.equal(args.p_environment, 'PRODUCAO');
    return envelope({ rows: [{ ...system, privateKey: 'FORBIDDEN' }], page: 1, pageSize: 500, totalItems: 1 });
  });
  assert.deepEqual(await service.list(scope), [system]);
  assert.equal(parseCancellationModel({ ...system, category: 'OUTROS', reasonCode: '9' }).reasonCode, '9');
});

test('system copy creates a scoped custom model with null ID/version; edits use the explicit saved version', async () => {
  const calls: Record<string, unknown>[] = [];
  const service = createNfseCancellationModelsService(async (_name, args) => {
    calls.push(args); return envelope({ model: { ...system, id: id(4), source: 'CUSTOM', version: args.p_model_id ? 2 : 1 } });
  });
  await service.save(scope, { requestId: id(3), modelId: null, expectedVersion: null, definition });
  assert.equal(calls[0].p_model_id, null); assert.equal(calls[0].p_expected_version, null);
  assert.deepEqual(calls[0].p_definition, definition);
  await service.save(scope, { requestId: id(5), modelId: id(4), expectedVersion: 1, definition });
  assert.equal(calls[1].p_model_id, id(4)); assert.equal(calls[1].p_expected_version, 1);
  assert(!/recipient|amount|accessKey|number|xml/i.test(JSON.stringify(calls)));
});

test('unknown codes, identity variables, system edits and crossed scope fail before creating a cancellation', async () => {
  let calls = 0; const service = createNfseCancellationModelsService(async () => { calls++; return null; });
  for (const change of [{ textTemplate: 'Motivo: {{nome}}.' }, { textTemplate: 'curto' }, { category: 'FREE_TEXT' }, { reasonCode: '3' }, { eventCode: '101103' }]) {
    assert.throws(() => cancellationModelDefinition({ ...definition, ...change } as typeof definition), NfseContractError);
  }
  await assert.rejects(service.save(scope, { requestId: id(3), modelId: system.id, expectedVersion: 1, definition }), NfseContractError);
  await assert.rejects(service.save(scope, { requestId: id(3), modelId: null, expectedVersion: 0, definition }), NfseContractError);
  assert.equal(calls, 0);
  const crossed = createNfseCancellationModelsService(async () => envelope({ rows: [system], page: 1, pageSize: 500, totalItems: 1 }, { ...scope, environment: 'HOMOLOGACAO' }));
  await assert.rejects(crossed.list(scope), NfseContractError);
});
