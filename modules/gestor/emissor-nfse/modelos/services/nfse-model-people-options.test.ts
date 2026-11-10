import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNfseModelPeopleOptions, isNfseModelPeopleOptionsComplete,
  parseNfseModelPeopleOptions, serializeNfseModelPeopleOptions } from './nfse-model-people-options';

const id = '00000000-0000-0000-0000-000000000001';
const defaults = createDefaultNfseModelPeopleOptions();

test('people options preserve legacy null and defer dates, numbering and tax regime to emission', () => {
  assert.equal(parseNfseModelPeopleOptions(undefined), null);
  assert.equal(serializeNfseModelPeopleOptions(null), null);
  assert.equal(isNfseModelPeopleOptionsComplete(null, false), false);
  assert.deepEqual(serializeNfseModelPeopleOptions(defaults), defaults);
  assert.equal(defaults.competenceDate, null); assert.equal(defaults.dpsSeries, null);
  assert.equal(defaults.simpleNationalOption, 'FROM_ESTABLISHMENT');
  assert.equal(defaults.simpleNationalAssessment, null);
});

test('fixed dates validate actual calendar dates and custom series stay in the API range', () => {
  assert.equal(parseNfseModelPeopleOptions({ ...defaults, competenceMode: 'FIXED_DATE', competenceDate: '2024-02-29' })?.competenceDate, '2024-02-29');
  for (const change of [
    { competenceMode: 'FIXED_DATE' }, { competenceDate: '2026-11-10' },
    { competenceMode: 'FIXED_DATE', competenceDate: '2026-02-29' },
    { competenceMode: 'FIXED_DATE', competenceDate: '2026-11-10T12:00:00Z' },
    { dpsSeriesMode: 'CUSTOM' }, { dpsSeries: '1' },
    ...['0', '50000', '100000', '1.0', '１', '^1$'].map(dpsSeries => ({ dpsSeriesMode: 'CUSTOM', dpsSeries })),
  ]) assert.equal(isNfseModelPeopleOptionsComplete({ ...defaults, ...change }, null), false);
  for (const dpsSeries of ['1', '00001', '49999']) {
    assert.equal(parseNfseModelPeopleOptions({ ...defaults, dpsSeriesMode: 'CUSTOM', dpsSeries })?.dpsSeries, dpsSeries);
  }
});

test('Simples choices require assessment for explicit ME/EPP and reject inactive values', () => {
  assert.throws(() => parseNfseModelPeopleOptions({ ...defaults, simpleNationalOption: '3' }));
  for (const simpleNationalAssessment of ['FROM_ESTABLISHMENT', '1', '2', '3']) {
    assert.equal(isNfseModelPeopleOptionsComplete({ ...defaults, simpleNationalOption: '3', simpleNationalAssessment }, false), true);
  }
  for (const simpleNationalOption of ['1', '2']) {
    assert.equal(isNfseModelPeopleOptionsComplete({ ...defaults, simpleNationalOption, simpleNationalAssessment: '1' }, false), false);
  }
});

test('IBS/CBS fixed competence starts on 2026-01-01 without restricting non-IBS history', () => {
  const options = { ...defaults, competenceMode: 'FIXED_DATE', competenceDate: '2025-12-31', recipientIsDestination: true };
  assert.throws(() => parseNfseModelPeopleOptions(options, true));
  assert.equal(isNfseModelPeopleOptionsComplete({ ...options, competenceDate: '2026-01-01' }, true), true);
  assert.equal(isNfseModelPeopleOptionsComplete({ ...options, competenceDate: '2026-11-10' }, true), true);
  assert.equal(isNfseModelPeopleOptionsComplete({ ...options, recipientIsDestination: null }, false), true);
  assert.equal(isNfseModelPeopleOptionsComplete({ ...defaults, recipientIsDestination: true }, true), true);
});

test('IBS/CBS destination and informed intermediary require fixed partner references', () => {
  assert.equal(isNfseModelPeopleOptionsComplete(defaults, true), false);
  const same = { ...defaults, recipientIsDestination: true };
  assert.equal(isNfseModelPeopleOptionsComplete(same, true), true);
  const destination = { ...defaults, recipientIsDestination: false, destinationPartnerId: id };
  assert.equal(isNfseModelPeopleOptionsComplete(destination, true), true);
  assert.equal(isNfseModelPeopleOptionsComplete(destination, false), false);
  for (const change of [{ recipientIsDestination: false }, { destinationPartnerId: id },
    { intermediaryLocation: 'EXTERIOR' }, { intermediaryPartnerId: id },
    { recipientLocation: 'NOT_INFORMED', recipientIncludeAddress: true }]) {
    assert.equal(isNfseModelPeopleOptionsComplete({ ...same, ...change }, true), false);
  }
  for (const intermediaryLocation of ['BRASIL', 'EXTERIOR']) {
    assert.equal(isNfseModelPeopleOptionsComplete({ ...same, intermediaryLocation, intermediaryPartnerId: id }, true), true);
  }
});

test('serialization removes DTO labels and rejects copied identities or unknown fiscal fields', () => {
  const withLabels = { ...defaults, destinationPartnerLabel: 'Parceiro sintético', intermediaryPartnerLabel: null };
  assert.equal(parseNfseModelPeopleOptions(withLabels)?.destinationPartnerLabel, 'Parceiro sintético');
  assert.deepEqual(serializeNfseModelPeopleOptions(withLabels), defaults);
  for (const change of [{ version: 2 }, { cpf: 'SYNTHETIC' }, { name: 'SYNTHETIC' },
    { address: {} }, { issuedAt: '2026-11-10' }, { dpsNumber: '1' }, { governmentPurchase: true },
    { destinationPartnerId: 'malformed' }, { recipientIncludeAddress: 'true' }]) {
    assert.throws(() => serializeNfseModelPeopleOptions({ ...defaults, ...change }));
  }
});
