import assert from 'node:assert/strict';
import test from 'node:test';
import { nfseModelsForType, nfseModelTypeLabel } from './nfse-model-type';
import { nfseModelDefinition, parseNfseStoredModel } from './services/nfse-models.contract';
import type { NfseModel } from '../types/nfse.types';
const base = { id: 'fixture', name: 'Técnico', active: true, version: 1,
  nationalServiceCode: '080201', nbsCode: '122051900', operationIndicatorCode: '',
  serviceDescription: 'Serviço', issTreatment: 'TRIBUTAVEL', immunityType: null,
  technicalResponsibilityDocument: '', referenceDocument: '', complementaryInfo: '', orderReference: '' } as NfseModel;
test('type selection is explicit, never inferred from academic name or fiscal code', () => {
  const rows = [base, { ...base, id: 'student', modelType: 'ALUNO' as const },
    { ...base, id: 'service', modelType: 'SERVICO' as const },
    { ...base, id: 'both', modelType: 'AMBOS' as const },
    { ...base, id: 'inactive', modelType: 'ALUNO' as const, active: false }];
  assert.deepEqual(nfseModelsForType(rows, 'ALUNO').map(row => row.id), ['student', 'both']);
  assert.deepEqual(nfseModelsForType(rows, 'SERVICO').map(row => row.id), ['service', 'both']);
  assert.deepEqual(nfseModelsForType(rows, 'AMBOS').map(row => row.id), ['both']);
  assert.equal(nfseModelTypeLabel('AMBOS'), 'Ambos');
  assert.equal(nfseModelTypeLabel(null), 'Tipo não definido');
});
test('historical models parse unchanged but every new save requires explicit type', () => {
  assert.equal(parseNfseStoredModel(base).modelType, undefined);
  assert.throws(() => nfseModelDefinition({ ...base, requestId: 'test' }));
  assert.throws(() => parseNfseStoredModel({ ...base, modelType: 'BOTH' }));
  for (const modelType of ['ALUNO', 'SERVICO', 'AMBOS'] as const) {
    assert.equal(nfseModelDefinition({ ...base, modelType, requestId: 'test' }).modelType, modelType);
  }
});
