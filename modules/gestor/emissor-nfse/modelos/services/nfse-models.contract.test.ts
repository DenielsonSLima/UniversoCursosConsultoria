import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseModelInput, NfseScope } from '../../types/nfse.types';
import { NfseContractError } from '../../services/nfse.errors';
import { nfseModelDefinition, parseNfseStoredModel } from './nfse-models.contract';
import { createNfseModelsService } from './nfse-models.service-core';
import { nfseModelsKeys } from '../queries/nfse-models.keys';
import { createDefaultNfseModelPeopleOptions } from './nfse-model-people-options';
import { createEmptyNfseModelValuesOptions, serializeNfseModelValuesOptions } from './nfse-model-values-options';
import { createDefaultNfseModelAdditionalOptions, serializeNfseModelAdditionalOptions } from './nfse-model-additional-options';

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
    { nbsCode: '123' }, { operationIndicatorCode: '12345' }, { serviceDescription: 'x'.repeat(2001) },
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

test('people and service presets round-trip together and government purchases require a Brazilian recipient', () => {
  const serviceOptions = { version: 1 as const, countryCode: 'BRA', municipalityCode: '2803401',
    exportResultCountryCode: null, includeIbsCbs: true, governmentPurchase: true,
    governmentEntityType: '4' as const, operationType: '5' as const, countryLabel: 'BRASIL',
    municipalityLabel: 'JAPOATÃ / SE' };
  const peopleOptions = { ...createDefaultNfseModelPeopleOptions(), recipientIsDestination: false,
    destinationPartnerId: id(8), destinationPartnerLabel: 'Parceiro sintético' };
  const stored = { ...input, id: id(5), version: 1, operationIndicatorCode: '030102', serviceOptions, peopleOptions };
  const parsed = parseNfseStoredModel(stored);
  assert.equal(parsed.serviceOptions?.municipalityLabel, 'JAPOATÃ / SE');
  assert(parsed.peopleOptions?.version === 1);
  assert.equal(parsed.peopleOptions?.destinationPartnerLabel, 'Parceiro sintético');
  const definition = nfseModelDefinition({ ...parsed, requestId: id(3) });
  assert(definition.peopleOptions?.version === 1);
  assert.equal(definition.serviceOptions?.countryCode, 'BRA');
  assert.equal(definition.peopleOptions?.destinationPartnerId, id(8));
  assert.equal('countryLabel' in definition.serviceOptions!, false);
  assert.equal('destinationPartnerLabel' in definition.peopleOptions!, false);
  for (const recipientLocation of ['EXTERIOR', 'NOT_INFORMED'] as const) {
    assert.throws(() => nfseModelDefinition({ ...stored, peopleOptions: { ...peopleOptions, recipientLocation } }), NfseContractError);
  }
});

test('description preview sends the literal template and receipt month to the RPC', async () => {
  const monthScope = { ...scope, month: '2026-10' };
  const template = 'Valores recebidos em {{mes_referencia}}.';
  const signal = new AbortController().signal;
  const canonical = { description: 'Valores recebidos em outubro de 2026.', monthLabel: 'outubro de 2026', usesReferenceMonth: true };
  const service = createNfseModelsService(async (name, args, receivedSignal) => {
    assert.equal(name, 'preview_nfse_model_description_secure');
    assert.deepEqual(args, { p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: '2026-10', p_description: template });
    assert.equal(receivedSignal, signal);
    return envelope(canonical, monthScope);
  });
  assert.deepEqual(await service.previewDescription(monthScope, template, signal), canonical);
  assert.notDeepEqual(nfseModelsKeys.descriptionPreview(scope, template), nfseModelsKeys.descriptionPreview(monthScope, template));
  assert.notDeepEqual(nfseModelsKeys.descriptionPreview(scope, template), nfseModelsKeys.descriptionPreview(scope, 'Outro texto'));
});

test('transport preserves all four-step rules while discarding document supplier display labels', async () => {
  const values = createEmptyNfseModelValuesOptions();
  values.iss.suspensionType = 'NONE'; values.iss.retention = 'NONE';
  values.transparency.mode = 'PERCENTAGES';
  values.transparency.federalPercent = '1.23'; values.transparency.statePercent = '0'; values.transparency.municipalPercent = '0';
  values.deduction = { mode: 'DOCUMENTS', value: null, documents: [{ source: 'LINKED_OPERATION_DOCUMENTS',
    documentType: 'OTHER_FISCAL', categoryCode: '99', categoryDescription: 'Categoria sintética',
    documentDescription: 'Documento sintético', allocationMode: 'ELIGIBLE_AMOUNT', allocationValue: null,
    supplierSource: 'FIXED_PARTNER', supplierPartnerId: id(9), supplierPartnerLabel: 'Fornecedor sintético' }] };
  const additional = createDefaultNfseModelAdditionalOptions();
  additional.service.municipalServiceCode = { source: 'FIXED', value: '123' };
  additional.service.internalContributorCode = { source: 'AT_ISSUANCE', value: null };
  const configured = { ...input, valuesOptions: serializeNfseModelValuesOptions(values),
    additionalOptions: serializeNfseModelAdditionalOptions(additional) };
  const stored = parseNfseStoredModel({ ...configured, id: id(5), version: 2,
    valuesOptions: { ...configured.valuesOptions, deduction: values.deduction } });
  assert.equal(stored.valuesOptions?.deduction.documents[0].supplierPartnerLabel, 'Fornecedor sintético');
  const service = createNfseModelsService(async (name, args) => {
    assert.equal(name, 'save_nfse_model_secure');
    assert.deepEqual(args.p_definition, nfseModelDefinition(configured));
    const definition = args.p_definition as typeof configured;
    assert.equal(definition.valuesOptions?.deduction.documents[0].supplierPartnerId, id(9));
    assert.equal('supplierPartnerLabel' in definition.valuesOptions!.deduction.documents[0], false);
    assert.deepEqual(definition.additionalOptions?.service.internalContributorCode, { source: 'AT_ISSUANCE', value: null });
    return envelope({ id: id(5), version: 3, message: 'Modelo salvo.' });
  });
  await service.save(scope, { ...stored, requestId: id(6), expectedVersion: 2 });
  assert.equal('valuesOptions' in nfseModelDefinition(input), false, 'Legacy absence remains distinguishable from configured rules');
});

test('description preview accepts static text but rejects malformed or foreign-scope responses', async () => {
  const canonical = { description: 'Descrição literal.', monthLabel: 'novembro de 2026', usesReferenceMonth: false };
  const service = createNfseModelsService(async () => envelope(canonical));
  assert.deepEqual(await service.previewDescription(scope, canonical.description), canonical);
  for (const change of [{ description: '' }, { description: 'x'.repeat(2001) }, { monthLabel: null }, { usesReferenceMonth: 'true' }]) {
    const invalid = createNfseModelsService(async () => envelope({ ...canonical, ...change }));
    await assert.rejects(invalid.previewDescription(scope, 'Texto'), NfseContractError);
  }
  const otherMonth = createNfseModelsService(async () => envelope(canonical, { ...scope, month: '2026-10' }));
  await assert.rejects(otherMonth.previewDescription(scope, 'Texto'), NfseContractError);
});
