import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyNfseModelServiceOptions, isNfseServiceOptionsComplete, normalizeNfsePeopleOptions, normalizeNfseServiceOptions, requiresNfseOperationType } from './nfse-model-options-form';
import { createDefaultNfseModelPeopleOptions } from './services/nfse-model-people-options';

test('service options do not infer location or IBS/CBS choices for new or legacy models', () => {
  const empty = emptyNfseModelServiceOptions();
  assert.equal(empty.countryCode, ''); assert.equal(empty.includeIbsCbs, null);
  for (const options of [null, undefined, empty, { ...empty, countryCode: 'BRA', municipalityCode: '2803401' }]) {
    assert.equal(isNfseServiceOptionsComplete(options, '080201', '', 'TRIBUTAVEL'), false);
  }
});

test('Brazil requires IBGE selection while a foreign country removes Brazilian municipality', () => {
  const base = { ...emptyNfseModelServiceOptions(), countryCode: 'BRA', includeIbsCbs: false };
  assert.equal(isNfseServiceOptionsComplete(base, '080201', '', 'TRIBUTAVEL'), false);
  const brazil = { ...base, municipalityCode: '2803401', municipalityLabel: 'JAPOATÃ/SE' };
  assert.equal(isNfseServiceOptionsComplete(brazil, '080201', '', 'TRIBUTAVEL'), true);
  const foreign = normalizeNfseServiceOptions({ ...brazil, countryCode: 'PRT' }, '080201', 'TRIBUTAVEL');
  assert.equal(foreign.municipalityCode, null); assert.equal(foreign.municipalityLabel, null);
  assert.equal(isNfseServiceOptionsComplete(foreign, '080201', '', 'TRIBUTAVEL'), true);
});

test('IBS/CBS conditions demand explicit government and operation choices and clear inactive dependencies', () => {
  const base = { ...emptyNfseModelServiceOptions(), countryCode: 'PRT', includeIbsCbs: true };
  assert.equal(isNfseServiceOptionsComplete(base, '080201', '100301', 'TRIBUTAVEL'), false);
  const ordinary = { ...base, governmentPurchase: false };
  assert.equal(isNfseServiceOptionsComplete(ordinary, '080201', '', 'TRIBUTAVEL'), false);
  assert.equal(isNfseServiceOptionsComplete(ordinary, '080201', '100301', 'TRIBUTAVEL'), true);
  const government = { ...base, governmentPurchase: true, governmentEntityType: '4' as const, operationType: '1' as const };
  assert.equal(isNfseServiceOptionsComplete(government, '080201', '100301', 'TRIBUTAVEL'), true);
  const disabled = normalizeNfseServiceOptions({ ...government, includeIbsCbs: false }, '080201', 'TRIBUTAVEL');
  assert.equal(disabled.governmentPurchase, null); assert.equal(disabled.governmentEntityType, null); assert.equal(disabled.operationType, null);
});

test('operation type follows the official government and service-code conditions', () => {
  const options = { ...emptyNfseModelServiceOptions(), countryCode: 'PRT', includeIbsCbs: true, governmentPurchase: false };
  assert.equal(requiresNfseOperationType(options, '080201'), false);
  for (const code of ['250501', '150901', '171201', '100501']) {
    assert.equal(requiresNfseOperationType(options, code), true);
    assert.equal(isNfseServiceOptionsComplete(options, code, '100301', 'TRIBUTAVEL'), false);
    assert.equal(isNfseServiceOptionsComplete({ ...options, operationType: '5' }, code, '100301', 'TRIBUTAVEL'), true);
  }
  assert.equal(requiresNfseOperationType({ ...options, includeIbsCbs: false }, '250501'), false);
});

test('exportation requires the result country and clears it when treatment changes', () => {
  const options = { ...emptyNfseModelServiceOptions(), countryCode: 'PRT', includeIbsCbs: false };
  assert.equal(isNfseServiceOptionsComplete(options, '080201', '', 'EXPORTACAO'), false);
  const exported = { ...options, exportResultCountryCode: 'ARG', exportResultCountryLabel: 'ARGENTINA' };
  assert.equal(isNfseServiceOptionsComplete(exported, '080201', '', 'EXPORTACAO'), true);
  const ordinary = normalizeNfseServiceOptions(exported, '080201', 'TRIBUTAVEL');
  assert.equal(ordinary.exportResultCountryCode, null); assert.equal(ordinary.exportResultCountryLabel, null);
});

test('central People normalization forces government recipients to Brazil and clears inactive IBS links', () => {
  const people = { ...createDefaultNfseModelPeopleOptions(), recipientLocation: 'EXTERIOR' as const,
    recipientIsDestination: false, destinationPartnerId: '00000000-0000-0000-0000-000000000001', destinationPartnerLabel: 'Sintético' };
  const government = { ...emptyNfseModelServiceOptions(), includeIbsCbs: true, governmentPurchase: true };
  const normalized = normalizeNfsePeopleOptions(people, government);
  assert(normalized.version === 1);
  assert.equal(normalized.recipientLocation, 'BRASIL');
  const disabled = normalizeNfsePeopleOptions(people, { ...government, includeIbsCbs: false, governmentPurchase: null });
  assert(disabled.version === 1);
  assert.equal(disabled.recipientIsDestination, null); assert.equal(disabled.destinationPartnerId, null);
  assert.equal(disabled.destinationPartnerLabel, null); assert.equal(disabled.recipientLocation, 'EXTERIOR');
});
