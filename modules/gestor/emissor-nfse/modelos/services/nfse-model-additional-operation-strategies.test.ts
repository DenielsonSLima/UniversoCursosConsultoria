import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNfseModelPeopleOptionsV2 } from './nfse-model-people-options';
import { createDefaultNfseModelAdditionalOptions, parseNfseModelAdditionalOptions,
  normalizeNfseModelAdditionalOptions, validateNfseModelAdditionalOptions } from './nfse-model-additional-options';
import { nfseAdditionalScenario } from './nfse-model-additional-validation';
import type { NfseModelPresetContext } from './nfse-model-preset-context';
import type { ForeignTrade } from './nfse-model-additional.types';

const atIssuance = { source: 'AT_ISSUANCE', value: null } as const;
const inherited = { policy: 'FROM_PARTNER', absenceReason: null } as const;
function context(): NfseModelPresetContext {
  return { environment: 'HOMOLOGACAO', nationalServiceCode: '080201', nbsCode: '122020000', operationIndicatorCode: '', issTreatment: 'TRIBUTAVEL',
    peopleOptions: createDefaultNfseModelPeopleOptionsV2(), issuerSimpleNationalOption: '3', issuerSimpleNationalAssessment: '1',
    serviceOptions: { version: 1, countryCode: 'BRA', municipalityCode: '2803401', exportResultCountryCode: null,
      includeIbsCbs: false, governmentPurchase: null, governmentEntityType: null, operationType: null } };
}
const trade = (): ForeignTrade => ({ provisionMode: '1', relationship: '0', currencyCode: '220', serviceAmount: atIssuance,
  providerSupport: '01', recipientSupport: '01', temporaryGoods: '1', importDeclaration: null, exportRegistration: null, shareWithMdic: false });

test('v2 resolves participants and NIF from operation without fixed identity or inferred nationality', () => {
  const ctx = context();
  const defaults = createDefaultNfseModelAdditionalOptions();
  const normalized = normalizeNfseModelAdditionalOptions(defaults, ctx)!;
  assert.equal(normalized.people.providerPartner, null); assert.equal(normalized.people.providerLocation, null);
  assert.deepEqual(normalized.people.nif.recipient, inherited); assert.equal(normalized.people.nif.intermediary, null);
  assert.deepEqual(validateNfseModelAdditionalOptions(normalized, ctx), []);
  assert.equal(nfseAdditionalScenario(ctx, normalized).foreignTrade, false);
  assert.deepEqual(defaults.people.nif, { provider: null, recipient: null, destination: null, intermediary: null }, 'Loaded definition is immutable');
  assert(!JSON.stringify(normalized).includes('BRASIL')); assert(!JSON.stringify(normalized).includes('EXTERIOR'));
});

test('explicit upgrade removes fixed provider, rejected invoice keys and prior-operation references', () => {
  const ctx = context(); ctx.peopleOptions = { ...createDefaultNfseModelPeopleOptionsV2(), issuerRole: 'RECIPIENT',
    recipientIsDestination: false, destinationSource: 'AT_ISSUANCE', intermediarySource: 'AT_ISSUANCE' };
  ctx.serviceOptions = { ...ctx.serviceOptions!, includeIbsCbs: true, operationType: '2' }; ctx.operationIndicatorCode = '100301';
  const old = createDefaultNfseModelAdditionalOptions();
  old.people.providerPartner = { source: 'FIXED', value: '00000000-0000-0000-0000-000000000001' };
  old.people.providerPartnerLabel = 'PRESTADOR HISTÓRICO'; old.people.providerLocation = 'EXTERIOR';
  old.people.destinationLocation = 'BRASIL'; old.people.emissionReason = '4';
  old.people.rejectedInvoiceReference = { source: 'FIXED', value: '0'.repeat(50) };
  old.service.operationReferences = { source: 'FIXED', value: ['0'.repeat(50)] };
  const original = JSON.stringify(old);
  assert(parseNfseModelAdditionalOptions(old), 'Historical GET remains readable');
  assert(validateNfseModelAdditionalOptions(old, ctx).some(issue => issue.includes('escolhido na emissão')));
  const next = normalizeNfseModelAdditionalOptions(old, ctx)!;
  assert.deepEqual(next.people.providerPartner, atIssuance); assert.equal(next.people.providerLocation, 'FROM_PARTNER');
  assert.equal(next.people.destinationLocation, 'FROM_PARTNER'); assert.equal('providerPartnerLabel' in next.people, false);
  assert.deepEqual(next.people.rejectedInvoiceReference, atIssuance); assert.deepEqual(next.service.operationReferences, atIssuance);
  for (const rule of Object.values(next.people.nif)) assert.deepEqual(rule, inherited);
  assert.deepEqual(validateNfseModelAdditionalOptions(next, ctx), []); assert.equal(JSON.stringify(old), original);
  assert.deepEqual(normalizeNfseModelAdditionalOptions(next, ctx), next, 'Strategies stay idempotent after editing');
});

test('comex is conditional with unresolved parties and mandatory only for known service context', () => {
  const ctx = context(), value = normalizeNfseModelAdditionalOptions(createDefaultNfseModelAdditionalOptions(), ctx)!;
  value.service.foreignTrade = trade();
  assert.deepEqual(validateNfseModelAdditionalOptions(value, ctx), [], 'Domestic provision does not presume a domestic recipient');
  assert.deepEqual(normalizeNfseModelAdditionalOptions(value, ctx)!.service.foreignTrade, trade());
  for (const foreign of [{ ...ctx, issTreatment: 'EXPORTACAO' as const }, { ...ctx, serviceOptions: { ...ctx.serviceOptions!, countryCode: 'PRT', municipalityCode: null } }]) {
    assert(validateNfseModelAdditionalOptions({ ...value, service: { ...value.service, foreignTrade: null } }, foreign).some(issue => issue.includes('comércio exterior')));
  }
  value.service.foreignTrade!.temporaryGoods = '2'; value.service.foreignTrade!.importDeclaration = { source: 'FIXED', value: '123456' };
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('números de importação')));
  const declaration = normalizeNfseModelAdditionalOptions(value, ctx)!;
  assert.deepEqual(declaration.service.foreignTrade!.importDeclaration, atIssuance);
  declaration.service.foreignTrade!.temporaryGoods = '3';
  const registration = normalizeNfseModelAdditionalOptions(declaration, ctx)!;
  assert.equal(registration.service.foreignTrade!.importDeclaration, null); assert.deepEqual(registration.service.foreignTrade!.exportRegistration, atIssuance);
  value.people.nif.recipient = { policy: 'WITHOUT_NIF', absenceReason: '1' };
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('cadastros selecionados')));
});
