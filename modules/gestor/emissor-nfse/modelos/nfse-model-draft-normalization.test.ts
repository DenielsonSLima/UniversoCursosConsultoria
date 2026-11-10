import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../types/nfse.types';
import type { NfseModelFormValues } from './NfseModelServiceFields';
import type { NfseModelIssuerMetadata } from './services/nfse-model-issuer.service-core';
import { normalizeNfseModelDraft } from './nfse-model-draft-normalization';
import { createDefaultNfseModelPeopleOptions, createDefaultNfseModelPeopleOptionsV2 } from './services/nfse-model-people-options';
import { createDefaultNfseModelServiceOptions } from './services/nfse-model-service-options';
import { createEmptyNfseModelValuesOptions } from './services/nfse-model-values-options';

const scope = { contextKey: '00000000-0000-0000-0000-000000000001', poloId: '00000000-0000-0000-0000-000000000002',
  month: '2023-01', environment: 'HOMOLOGACAO' } as NfseScope;
const partner = '00000000-0000-0000-0000-000000000003';
const issuer = (option: NfseModelIssuerMetadata['opSimpNac'], assessment: NfseModelIssuerMetadata['regApTribSN'] = null) =>
  ({ opSimpNac: option, regApTribSN: assessment } as NfseModelIssuerMetadata);
function fixture(): NfseModelFormValues {
  const value = createEmptyNfseModelValuesOptions();
  return { name: 'Modelo sintético', nationalServiceCode: '080201', nbsCode: '122020000', operationIndicatorCode: '100301',
    serviceDescription: 'Descrição sintética', issTreatment: 'TRIBUTAVEL', immunityType: '', technicalResponsibilityDocument: '',
    referenceDocument: '', complementaryInfo: 'Complemento sintético', orderReference: 'Pedido sintético', active: true, additionalOptions: null,
    serviceOptions: { ...createDefaultNfseModelServiceOptions(), countryCode: 'BRA', municipalityCode: '2803401',
      includeIbsCbs: true, governmentPurchase: true, governmentEntityType: '4', operationType: '1',
      countryLabel: 'BRASIL', municipalityLabel: 'Município sintético', exportResultCountryLabel: null },
    peopleOptions: { ...createDefaultNfseModelPeopleOptions(), recipientIsDestination: false,
      destinationPartnerId: partner, destinationPartnerLabel: 'Destino sintético',
      intermediaryLocation: 'BRASIL', intermediaryPartnerId: partner, intermediaryPartnerLabel: 'Intermediário sintético' },
    valuesOptions: { ...value, serviceAmount: { source: 'FIXED', fixedAmount: '260.00' },
      conditionalDiscount: { source: 'FIXED', value: '1.00', base: null },
      iss: { ...value.iss, suspensionType: 'NONE', retention: 'NONE' },
      deduction: { mode: 'FIXED', value: '2.00', documents: [] },
      federal: { ...value.federal, mode: 'EXPLICIT', pisCofinsCst: '01',
        base: { source: 'PERCENTAGE', value: '100', base: 'SERVICE' }, pisRatePercent: '1.65', cofinsRatePercent: '7.60', retentionType: '0',
        withheldIrrf: { source: 'FIXED', value: '1.23', base: null } },
      ibscbs: { cst: '200', classificationCode: '200004', presumedCreditCode: null, regularTaxation: null,
        deferral: null, reimbursementDocuments: [] },
      transparency: { ...value.transparency, mode: 'PERCENTAGES', federalPercent: '1.23', statePercent: '0', municipalPercent: '4.56' } },
  };
}
function exceptFederal(fields: NfseModelFormValues) {
  const { federal: _federal, ...otherValues } = fields.valuesOptions!;
  return { ...fields, valuesOptions: otherValues };
}

test('explicit non-optant and SN outside federal assessment preserve legitimate federal rules', () => {
  for (const choice of [
    { simpleNationalOption: '1' as const, simpleNationalAssessment: null },
    { simpleNationalOption: '3' as const, simpleNationalAssessment: '3' as const },
  ]) {
    const fields = fixture(); fields.peopleOptions = { ...fields.peopleOptions!, ...choice };
    const before = JSON.stringify(fields);
    const result = normalizeNfseModelDraft(fields, scope, issuer('3', '1'));
    assert.deepEqual(result, fields, 'Explicit model choices must take precedence over a conflicting establishment regime');
    assert.equal(result.valuesOptions!.federal, fields.valuesOptions!.federal);
    assert.equal(JSON.stringify(fields), before, 'Normalization must not mutate the loaded model');
  }
});

test('MEI and SN assessments1/2 clear only incompatible explicit federal rules', () => {
  for (const choice of [
    { simpleNationalOption: '2' as const, simpleNationalAssessment: null },
    { simpleNationalOption: '3' as const, simpleNationalAssessment: '1' as const },
    { simpleNationalOption: '3' as const, simpleNationalAssessment: '2' as const },
  ]) {
    const fields = fixture(); fields.peopleOptions = { ...fields.peopleOptions!, ...choice };
    const before = JSON.stringify(fields);
    const result = normalizeNfseModelDraft(fields, scope, issuer('1'));
    assert.deepEqual(result.valuesOptions!.federal, createEmptyNfseModelValuesOptions().federal);
    assert.deepEqual(exceptFederal(result), exceptFederal(fields), 'Do not clear monetary sources, deductions, ISS, IBS, partners or transparency');
    assert.equal(JSON.stringify(fields), before);
    assert.deepEqual(normalizeNfseModelDraft(result, scope, issuer('1')), result, 'Repeated edits must be idempotent');
  }
});

test('inherited confirmed regimes clear only federally incompatible rules and never guess missing metadata', () => {
  for (const metadata of [issuer('1'), issuer('3', '3'), issuer(null), issuer('3', null), undefined]) {
    const fields = fixture();
    assert.deepEqual(normalizeNfseModelDraft(fields, scope, metadata), fields, 'Non-optant, outside-SN and unresolved data must preserve explicit rules');
  }
  for (const metadata of [issuer('2'), issuer('3', '1'), issuer('3', '2')]) {
    const fields = fixture(); const result = normalizeNfseModelDraft(fields, scope, metadata);
    assert.deepEqual(result.valuesOptions!.federal, createEmptyNfseModelValuesOptions().federal);
    assert.deepEqual(exceptFederal(result), exceptFederal(fields));
  }
});

test('disabling IBS centrally clears only IBS-dependent branches even while Valores is unmounted', () => {
  const fields = fixture();
  fields.peopleOptions = { ...fields.peopleOptions!, simpleNationalOption: '1', simpleNationalAssessment: null };
  const previous = JSON.stringify(fields);
  const edited = { ...fields, serviceOptions: { ...fields.serviceOptions!, includeIbsCbs: false } };
  const result = normalizeNfseModelDraft(edited, scope, issuer('3', '1'));
  assert(result.peopleOptions?.version === 1);
  assert.equal(result.valuesOptions!.ibscbs, null);
  assert.equal(result.peopleOptions!.recipientIsDestination, null);
  assert.equal(result.peopleOptions!.destinationPartnerId, null);
  assert.equal(result.peopleOptions!.destinationPartnerLabel, null);
  assert.equal(result.serviceOptions!.governmentPurchase, null);
  assert.equal(result.serviceOptions!.governmentEntityType, null);
  assert.equal(result.serviceOptions!.operationType, null);
  assert.equal(result.operationIndicatorCode, '');
  assert.equal(result.peopleOptions!.intermediaryPartnerId, partner, 'Intermediary is an independent party, not an IBS-only field');
  const { ibscbs: _oldIbs, ...oldValues } = fields.valuesOptions!;
  const { ibscbs: _newIbs, ...newValues } = result.valuesOptions!;
  assert.deepEqual(newValues, oldValues, 'ISS/federal/deduction/transparency and money rules must survive the toggle');
  assert.equal(JSON.stringify(fields), previous);
  const enabled = normalizeNfseModelDraft({ ...result,
    serviceOptions: { ...result.serviceOptions!, includeIbsCbs: true } }, scope, issuer('1'));
  assert(enabled.peopleOptions?.version === 1);
  assert.equal(enabled.valuesOptions!.ibscbs, null, 'Re-enabling IBS must not resurrect a stale classification');
  assert.equal(enabled.peopleOptions!.recipientIsDestination, null, 'A new destination decision is explicit');
  assert.equal(enabled.peopleOptions!.intermediaryPartnerId, partner);
});

test('unrelated edits with IBS active preserve complete IBS rules, dates and fixed references', () => {
  const fields = fixture();
  fields.peopleOptions = { ...fields.peopleOptions!, competenceMode: 'FIXED_DATE', competenceDate: '2026-11-10',
    dpsSeriesMode: 'CUSTOM', dpsSeries: '123', simpleNationalOption: '1', simpleNationalAssessment: null };
  const result = normalizeNfseModelDraft({ ...fields, name: 'Nome sintético alterado' }, scope, issuer('2'));
  assert.equal(result.name, 'Nome sintético alterado');
  assert.deepEqual(result.valuesOptions, fields.valuesOptions);
  assert.deepEqual(result.peopleOptions, fields.peopleOptions);
  assert.deepEqual(result.serviceOptions, fields.serviceOptions);
});

test('legacy null Values remains absent during unrelated form edits', () => {
  const fields = fixture(); fields.valuesOptions = null;
  const result = normalizeNfseModelDraft(fields, scope, issuer('2'));
  assert.equal(result.valuesOptions, null, 'Do not fabricate a new Values configuration for legacy models');
});

test('People v2 preserves issuance strategies and contains no fixed participant identity', () => {
  const fields = fixture();
  fields.peopleOptions = { ...createDefaultNfseModelPeopleOptionsV2(), simpleNationalOption: '1',
    recipientIsDestination: false, destinationSource: 'AT_ISSUANCE', intermediarySource: 'AT_ISSUANCE' };
  const before = JSON.stringify(fields);
  const result = normalizeNfseModelDraft({ ...fields, name: 'Nome sintético alterado' }, scope, issuer('3', '1'));
  assert(result.peopleOptions?.version === 2);
  assert.deepEqual(result.peopleOptions, fields.peopleOptions, 'Unrelated edits preserve operation strategies even with government purchase');
  for (const key of ['recipientLocation', 'recipientIncludeAddress', 'destinationPartnerId', 'destinationPartnerLabel', 'intermediaryLocation', 'intermediaryPartnerId']) {
    assert.equal(key in result.peopleOptions, false);
  }
  const withoutIbs = normalizeNfseModelDraft({ ...result,
    serviceOptions: { ...result.serviceOptions!, includeIbsCbs: false } }, scope, issuer('1'));
  assert(withoutIbs.peopleOptions?.version === 2);
  assert.equal(withoutIbs.peopleOptions.recipientSource, 'AT_ISSUANCE');
  assert.equal(withoutIbs.peopleOptions.recipientAddressSource, 'FROM_PARTNER');
  assert.equal(withoutIbs.peopleOptions.recipientIsDestination, null);
  assert.equal(withoutIbs.peopleOptions.destinationSource, null);
  assert.equal(withoutIbs.peopleOptions.intermediarySource, 'AT_ISSUANCE', 'Intermediation is independent from IBS');
  assert.equal(JSON.stringify(fields), before);
});
