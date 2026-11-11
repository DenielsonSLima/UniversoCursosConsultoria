import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNfseModelPeopleOptions, createDefaultNfseModelPeopleOptionsV2,
  parseNfseModelPeopleOptions, serializeNfseModelPeopleOptions, upgradeNfseModelPeopleOptions } from './nfse-model-people-options';

const partner = '00000000-0000-0000-0000-000000000001';
test('new pre-model stores operation strategies without participants or their locations', () => {
  const value = createDefaultNfseModelPeopleOptionsV2();
  assert.equal(value.recipientSource, 'AT_ISSUANCE'); assert.equal(value.recipientAddressSource, 'FROM_PARTNER');
  assert.deepEqual(parseNfseModelPeopleOptions(value, false), value);
  assert.deepEqual(serializeNfseModelPeopleOptions(value, false), value);
  for (const field of ['recipientLocation', 'recipientIncludeAddress', 'destinationPartnerId', 'intermediaryPartnerId',
    'destinationPartnerLabel', 'cpf', 'cnpj', 'name', 'phone', 'email', 'address', 'document']) {
    assert.equal(field in value, false); assert.throws(() => parseNfseModelPeopleOptions({ ...value, [field]: null }, false));
  }
});

test('historical read remains v1; only explicit edit upgrades identities into strategies', () => {
  const legacy = { ...createDefaultNfseModelPeopleOptions(), recipientIncludeAddress: true, recipientIsDestination: false,
    destinationPartnerId: partner, destinationPartnerLabel: 'DESTINATÁRIO HISTÓRICO', intermediaryLocation: 'EXTERIOR' as const,
    intermediaryPartnerId: partner, intermediaryPartnerLabel: 'INTERMEDIÁRIO HISTÓRICO', dpsSeriesMode: 'CUSTOM' as const, dpsSeries: '42' };
  assert.deepEqual(parseNfseModelPeopleOptions(legacy, true), legacy);
  const upgraded = upgradeNfseModelPeopleOptions(legacy, true);
  assert.equal(upgraded.version, 2); assert.equal(upgraded.destinationSource, 'AT_ISSUANCE');
  assert.equal(upgraded.intermediarySource, 'AT_ISSUANCE'); assert.equal(upgraded.recipientAddressSource, 'FROM_PARTNER'); assert.equal(upgraded.dpsSeries, '42');
  assert(!JSON.stringify(upgraded).includes(partner)); assert(!JSON.stringify(upgraded).includes('HISTÓRICO'));
  assert.equal(legacy.destinationPartnerId, partner); assert.equal(legacy.intermediaryLocation, 'EXTERIOR');
  assert.deepEqual(serializeNfseModelPeopleOptions(upgraded, true), upgraded);
});

test('v2 conditional destination requires no fixed ID and disappears when IBS is removed', () => {
  const value = createDefaultNfseModelPeopleOptionsV2();
  assert.throws(() => parseNfseModelPeopleOptions(value, true));
  const same = { ...value, recipientIsDestination: true }; assert.deepEqual(parseNfseModelPeopleOptions(same, true), same);
  assert.throws(() => parseNfseModelPeopleOptions({ ...same, destinationSource: 'AT_ISSUANCE' }, true));
  const different = { ...value, recipientIsDestination: false, destinationSource: 'AT_ISSUANCE' as const };
  assert.deepEqual(parseNfseModelPeopleOptions(different, true), different);
  assert.throws(() => parseNfseModelPeopleOptions(different, false));
  const normalized = upgradeNfseModelPeopleOptions(different, false);
  assert.equal(normalized.recipientIsDestination, null); assert.equal(normalized.destinationSource, null);
  assert.deepEqual(parseNfseModelPeopleOptions({ ...normalized, intermediarySource: 'AT_ISSUANCE' }, false), { ...normalized, intermediarySource: 'AT_ISSUANCE' });
});

test('v2 retains fiscal/date/series boundaries and validates all closed strategy choices', () => {
  const defaults = createDefaultNfseModelPeopleOptionsV2();
  for (const change of [{ recipientSource: 'FIXED' }, { recipientAddressSource: 'MANUAL' }, { intermediarySource: 'FIXED_PARTNER' },
    { version: 3 }, { dpsSeriesMode: 'CUSTOM', dpsSeries: '50000' }, { competenceMode: 'FIXED_DATE', competenceDate: '2026-02-30' },
    { simpleNationalOption: '3', simpleNationalAssessment: null }]) {
    assert.throws(() => parseNfseModelPeopleOptions({ ...defaults, ...change }, false));
  }
  const prior = { ...defaults, competenceMode: 'FIXED_DATE', competenceDate: '2025-12-31', recipientIsDestination: true };
  assert.throws(() => parseNfseModelPeopleOptions(prior, true));
  assert.equal(parseNfseModelPeopleOptions({ ...prior, competenceDate: '2026-01-01' }, true)?.competenceDate, '2026-01-01');
  assert.deepEqual(upgradeNfseModelPeopleOptions(null, false), defaults);
});
