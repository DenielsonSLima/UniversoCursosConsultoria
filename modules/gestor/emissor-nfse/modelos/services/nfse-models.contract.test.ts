import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseModelInput, NfseScope } from '../../types/nfse.types';
import { NfseContractError } from '../../services/nfse.errors';
import { nfseModelDefinition, parseNfseStoredModel } from './nfse-models.contract';
import { createNfseModelsService } from './nfse-models.service-core';
import { nfseModelsKeys } from '../queries/nfse-models.keys';

const id = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), month: '2026-11', environment: 'HOMOLOGACAO' };
const input: NfseModelInput = {
  requestId: id(3), name: 'Modelo de teste', nationalServiceCode: '080102', nbsCode: '122040000',
  operationIndicatorCode: '', serviceDescription: 'Serviço de teste', issTreatment: 'TRIBUTAVEL',
  immunityType: null, technicalResponsibilityDocument: '', referenceDocument: '',
  complementaryInfo: '', orderReference: '', active: true,
};
const envelope = (data: unknown, echo = scope) => ({ version: 1, scope: echo, data });

test('model transport preserves service fields and never sends incidental client financial values', async () => {
  let sent: Record<string, unknown> = {};
  const service = createNfseModelsService(async (name, args) => {
    assert.equal(name, 'save_nfse_model_secure'); sent = args;
    return envelope({ id: id(5), version: 1, message: 'Modelo salvo.' });
  });
  await service.save(scope, { ...input, receivedAmount: '0.01' } as NfseModelInput);
  assert.deepEqual(sent.p_definition, nfseModelDefinition(input));
  assert.equal('receivedAmount' in (sent.p_definition as object), false);
  assert.equal(sent.p_id, null); assert.equal(sent.p_expected_version, null);
});

test('models reject ambiguous tax treatment, malformed official field sizes and stale identifiers', async () => {
  const service = createNfseModelsService(async () => { throw new Error('Unexpected transport'); });
  for (const change of [{ issTreatment: '' }, { immunityType: '1' }, { issTreatment: 'IMUNIDADE' },
    { issTreatment: 'IMUNIDADE', immunityType: '0' }, { nationalServiceCode: '0801' },
    { nbsCode: '123' }, { operationIndicatorCode: '12345' }, { serviceDescription: 'x'.repeat(1001) },
    { technicalResponsibilityDocument: 'x'.repeat(41) }, { referenceDocument: 'x'.repeat(256) },
    { complementaryInfo: 'x'.repeat(2001) }, { orderReference: 'x'.repeat(61) }, { name: ' ' }]) {
    assert.throws(() => nfseModelDefinition({ ...input, ...change } as NfseModelInput), NfseContractError);
  }
  await assert.rejects(service.save(scope, { ...input, id: id(5) }), NfseContractError);
  await assert.rejects(service.save(scope, { ...input, expectedVersion: 1 }), NfseContractError);
  await assert.rejects(service.list({ ...scope, contextKey: 'invalid' }), NfseContractError);
  assert.equal(nfseModelDefinition({ ...input, issTreatment: 'IMUNIDADE', immunityType: '3' }).immunityType, '3');
});

test('model response enforces context, environment and complete fields without enabling provider', async () => {
  const stored = { ...nfseModelDefinition(input), id: id(5), version: 1 };
  assert.deepEqual(parseNfseStoredModel(stored), stored);
  const service = createNfseModelsService(async () => envelope({ rows: [stored], page: 1, pageSize: 100, totalItems: 1 }));
  assert.equal((await service.list(scope)).rows[0].nbsCode, input.nbsCode);
  const mismatch = createNfseModelsService(async () => envelope({}, { ...scope, poloId: id(99) }));
  await assert.rejects(mismatch.list(scope), NfseContractError);
  assert.throws(() => parseNfseStoredModel({ ...stored, nbsCode: undefined }), NfseContractError);
});

test('model cache invalidation spans months only inside the same context, polo and environment', () => {
  assert.deepEqual(nfseModelsKeys.scope(scope), nfseModelsKeys.scope({ ...scope, month: '2026-10' }));
  for (const changed of [{ contextKey: id(9) }, { poloId: id(9) }, { environment: 'PRODUCAO' as const }]) {
    assert.notDeepEqual(nfseModelsKeys.scope(scope), nfseModelsKeys.scope({ ...scope, ...changed }));
  }
});
