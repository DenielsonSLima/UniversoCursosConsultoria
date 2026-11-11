import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseModelValuesContext, getNfseModelReferenceDate } from './nfse-model-form-context';
import { createDefaultNfseModelPeopleOptions, createDefaultNfseModelPeopleOptionsV2 } from './services/nfse-model-people-options';
import { normalizeNfsePeopleOptions } from './nfse-model-options-form';
import type { NfseModelIssuerMetadata } from './services/nfse-model-issuer.service-core';

const people = createDefaultNfseModelPeopleOptions();
test('catalog eligibility follows competence strategy in Maceio, never the receipt month', () => {
  assert.equal(getNfseModelReferenceDate(null), '');
  assert.equal(getNfseModelReferenceDate(people, new Date('2026-11-11T01:30:00Z')), '2026-11-10');
  assert.equal(getNfseModelReferenceDate(people, new Date('2026-11-11T03:00:00Z')), '2026-11-11');
  assert.equal(getNfseModelReferenceDate({ ...people, competenceMode: 'FIXED_DATE', competenceDate: '2027-02-01' }), '2027-02-01');
  assert.equal(getNfseModelReferenceDate({ ...people, competenceMode: 'FIXED_DATE' }), '');
});

test('tax inheritance requires the selected establishment, while explicit model choices remain explicit', () => {
  const fields = { peopleOptions: people, serviceOptions: null, issTreatment: 'TRIBUTAVEL' as const,
    nationalServiceCode: '080201', nbsCode: '122020000' };
  const unknown = createNfseModelValuesContext(null, fields);
  assert.equal(unknown.simpleNationalOption, null); assert.equal(unknown.simpleNationalAssessment, null);
  const issuer = { opSimpNac: '3', regApTribSN: '1' } as NfseModelIssuerMetadata;
  const inherited = createNfseModelValuesContext(null, fields, issuer);
  assert.equal(inherited.simpleNationalOption, '3'); assert.equal(inherited.simpleNationalAssessment, '1');
  const explicit = createNfseModelValuesContext(null, { ...fields,
    peopleOptions: { ...people, simpleNationalOption: '1', simpleNationalAssessment: null } }, issuer);
  assert.equal(explicit.simpleNationalOption, '1'); assert.equal(explicit.simpleNationalAssessment, null);
  assert.equal(createNfseModelValuesContext(null, { ...fields,
    peopleOptions: { ...people, simpleNationalOption: '3', simpleNationalAssessment: null } }, issuer).simpleNationalAssessment, null);
});

test('operation participants are required strategies without copying identities or guessing their country', () => {
  const peopleV2 = createDefaultNfseModelPeopleOptionsV2();
  const fields = { peopleOptions: peopleV2, serviceOptions: null, issTreatment: 'TRIBUTAVEL' as const,
    nationalServiceCode: '080201', nbsCode: '122020000' };
  const ordinary = createNfseModelValuesContext(null, fields);
  assert.equal(ordinary.recipientAvailable, true);
  assert.equal(ordinary.intermediaryAvailable, false);
  const mediated = createNfseModelValuesContext(null, { ...fields,
    peopleOptions: { ...peopleV2, intermediarySource: 'AT_ISSUANCE' } });
  assert.equal(mediated.intermediaryAvailable, true);
  for (const key of ['recipientLocation', 'recipientIncludeAddress', 'destinationPartnerId', 'intermediaryPartnerId']) {
    assert.equal(key in peopleV2, false);
  }
  const normalized = normalizeNfsePeopleOptions(peopleV2, { version: 1, countryCode: 'BRA', municipalityCode: '2803401',
    exportResultCountryCode: null, includeIbsCbs: true, governmentPurchase: true, governmentEntityType: '4', operationType: '5' });
  assert(normalized.version === 2);
  assert.equal('recipientLocation' in normalized, false, 'Government purchase is a requirement checked on the selected party at issuance');
  assert.equal(normalized.recipientSource, 'AT_ISSUANCE');
});
