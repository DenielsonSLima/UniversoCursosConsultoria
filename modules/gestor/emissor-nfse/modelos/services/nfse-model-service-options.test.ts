import assert from 'node:assert/strict';
import test from 'node:test';
import { NfseContractError } from '../../services/nfse.errors';
import { createDefaultNfseModelServiceOptions, isNfseModelServiceOptionsComplete,
  parseNfseModelServiceOptions, serializeNfseModelServiceOptions } from './nfse-model-service-options';

const basic = { version: 1, countryCode: 'BRA', municipalityCode: '2803401', exportResultCountryCode: null,
  includeIbsCbs: false, governmentPurchase: null, governmentEntityType: null, operationType: null } as const;
const serialize = (value: unknown, treatment = 'TRIBUTAVEL', code = '080201', indicator = '') =>
  serializeNfseModelServiceOptions(value, treatment, code, indicator);

test('service templates preserve unknown legacy data and strip canonical display labels from mutations', () => {
  assert.equal(parseNfseModelServiceOptions(null), null);
  assert.equal(isNfseModelServiceOptionsComplete(null, 'TRIBUTAVEL', '080201', ''), false);
  assert.equal(isNfseModelServiceOptionsComplete(createDefaultNfseModelServiceOptions(), 'TRIBUTAVEL', '080201', ''), false);
  assert.deepEqual(serialize({ ...basic, countryLabel: 'BRASIL', municipalityLabel: 'JAPOATÃ / SE' }), basic);
  for (const extra of [{ amount: '1000.00' }, { recipient: { name: 'Fixture' } }, { countryCode: 'BR' }]) {
    assert.throws(() => serialize({ ...basic, ...extra }), NfseContractError);
  }
});

test('location and export result are distinct choices and never inferred from each other', () => {
  assert.throws(() => serialize({ ...basic, municipalityCode: null }), NfseContractError);
  assert.throws(() => serialize({ ...basic, countryCode: 'ARG' }), NfseContractError);
  assert.throws(() => serialize(basic, 'EXPORTACAO'), NfseContractError);
  assert.throws(() => serialize({ ...basic, exportResultCountryCode: 'ARG' }), NfseContractError);
  assert.equal(serialize({ ...basic, exportResultCountryCode: 'ARG' }, 'EXPORTACAO')?.countryCode, 'BRA');
  assert.equal(serialize({ ...basic, countryCode: 'ARG', municipalityCode: null })?.municipalityCode, null);
});

test('IBS/CBS requires an operation indicator and explicit government choice; operation type is separate', () => {
  assert.throws(() => serialize({ ...basic, includeIbsCbs: true }), NfseContractError);
  assert.throws(() => serialize({ ...basic, includeIbsCbs: true }, 'TRIBUTAVEL', '080201', '030102'), NfseContractError);
  const ordinary = { ...basic, includeIbsCbs: true, governmentPurchase: false };
  assert.equal(serialize(ordinary, 'TRIBUTAVEL', '080201', '030102')?.operationType, null);
  assert.throws(() => serialize({ ...ordinary, operationType: '1' }, 'TRIBUTAVEL', '080201', '030102'), NfseContractError);
  const government = { ...ordinary, governmentPurchase: true, governmentEntityType: '4', operationType: '5' };
  assert.equal(serialize(government, 'TRIBUTAVEL', '080201', '030102')?.operationType, '5');
  assert.throws(() => serialize({ ...government, governmentEntityType: null }, 'TRIBUTAVEL', '080201', '030102'), NfseContractError);
  assert.throws(() => serialize({ ...government, operationType: null }, 'TRIBUTAVEL', '080201', '030102'), NfseContractError);
  for (const code of ['250501', '150901', '171201', '100501']) {
    assert.throws(() => serialize(ordinary, 'TRIBUTAVEL', code, '030102'), NfseContractError);
    assert.equal(serialize({ ...ordinary, operationType: '1' }, 'TRIBUTAVEL', code, '030102')?.operationType, '1');
  }
  assert.throws(() => serialize(basic, 'TRIBUTAVEL', '080201', '030102'), NfseContractError);
});
