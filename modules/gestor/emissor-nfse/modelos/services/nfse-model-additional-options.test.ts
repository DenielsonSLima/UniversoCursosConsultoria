import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNfseModelPeopleOptions } from './nfse-model-people-options';
import { createDefaultNfseModelAdditionalOptions, parseNfseModelAdditionalOptions,
  serializeNfseModelAdditionalOptions, validateNfseModelAdditionalOptions,
  normalizeNfseModelAdditionalOptions } from './nfse-model-additional-options';
import { NFSE_CONSTRUCTION_CODES, nfseAdditionalScenario } from './nfse-model-additional-validation';
import type { ForeignTrade, NfseModelAdditionalDraft } from './nfse-model-additional.types';
import type { NfseModelPresetContext } from './nfse-model-preset-context';
import { nfseCurrencyOptions, nfseProviderSupportOptions, nfseRecipientSupportOptions } from './nfse-model-additional.domains';
import snapshot from '../catalogos/generated/nfse-additional-data';
import { nfsePresetReviewRows } from '../additional/nfse-preset-review.presentation';
import { describeNfsePresetCode } from '../additional/nfse-preset-review.domains';

const id = '00000000-0000-0000-0000-000000000001';
const atIssue = { source: 'AT_ISSUANCE', value: null } as const;
const context = (change: Partial<NfseModelPresetContext> = {}): NfseModelPresetContext => ({
  environment: 'HOMOLOGACAO', nationalServiceCode: '080201', nbsCode: '122020000', operationIndicatorCode: '', issTreatment: 'TRIBUTAVEL',
  peopleOptions: createDefaultNfseModelPeopleOptions(), issuerSimpleNationalOption: '3', issuerSimpleNationalAssessment: '1',
  serviceOptions: { version: 1, countryCode: 'BRA', municipalityCode: '2803401', exportResultCountryCode: null,
    includeIbsCbs: false, governmentPurchase: null, governmentEntityType: null, operationType: null }, ...change,
});
const trade = (): ForeignTrade => ({ provisionMode: '1', relationship: '0', currencyCode: '220', serviceAmount: atIssue,
  providerSupport: '01', recipientSupport: '01', temporaryGoods: '1', importDeclaration: null, exportRegistration: null, shareWithMdic: false });
const changed = (mutate: (value: NfseModelAdditionalDraft) => void) => { const value = createDefaultNfseModelAdditionalOptions(); mutate(value); return value; };

test('domestic educational defaults store no identity, dates, tax or monetary guesses', () => {
  const value = createDefaultNfseModelAdditionalOptions();
  assert.deepEqual(parseNfseModelAdditionalOptions(value), value);
  assert.deepEqual(validateNfseModelAdditionalOptions(value, context()), []);
  assert.equal(parseNfseModelAdditionalOptions(undefined), null);
  for (const key of ['name', 'cpf', 'cnpj', 'email', 'address']) assert.equal(key in value.people, false);
});

test('historical structural read preserves valid branches and strips only DTO labels on write', () => {
  const value = changed(value => { value.people.providerPartner = { source: 'FIXED', value: id }; value.people.providerPartnerLabel = 'PRESTADOR SINTÉTICO';
    value.service.municipalServiceCode = { source: 'FIXED', value: '123' }; });
  assert.equal(parseNfseModelAdditionalOptions(value)?.people.providerPartnerLabel, 'PRESTADOR SINTÉTICO');
  assert.equal('providerPartnerLabel' in serializeNfseModelAdditionalOptions(value)!.people, false);
  assert.equal(value.people.providerPartnerLabel, 'PRESTADOR SINTÉTICO', 'Serializer must not mutate the GET payload');
  assert(validateNfseModelAdditionalOptions(value, context()).some(issue => issue.includes('catálogo municipal')));
  for (const mutation of [value => { value.people.cpf = '00000000000'; }, value => { value.service.unknown = true; },
    value => { value.service.internalContributorCode = { source: 'AT_ISSUANCE', value: 'not empty' }; }]) {
    const invalid = JSON.parse(JSON.stringify(value)); mutation(invalid); assert.throws(() => parseNfseModelAdditionalOptions(invalid));
  }
});

test('provider role clears and validates provider-only inactive metadata; unknown location does not presume exterior', () => {
  const value = changed(value => { value.people.providerPartner = atIssue; value.people.providerLocation = 'FROM_PARTNER'; value.people.emissionReason = '1'; });
  assert(validateNfseModelAdditionalOptions(value, context()).some(issue => issue.includes('cadastro da unidade')));
  assert.equal(normalizeNfseModelAdditionalOptions(value, context())!.people.providerLocation, null);
  const ctx = context({ peopleOptions: { ...createDefaultNfseModelPeopleOptions(), issuerRole: 'RECIPIENT' } });
  assert.equal(nfseAdditionalScenario(ctx, value).foreignTrade, false);
  assert.deepEqual(validateNfseModelAdditionalOptions(value, ctx), []);
  value.people.providerLocation = 'EXTERIOR';
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('comércio exterior')));
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('NIF do prestador')));
});

test('NIF rules require official justification and cannot copy a concrete document', () => {
  const ctx = context({ peopleOptions: { ...createDefaultNfseModelPeopleOptions(), recipientLocation: 'EXTERIOR' } });
  const value = changed(value => { value.people.nif.recipient = { policy: 'WITHOUT_NIF', absenceReason: '1' }; value.service.foreignTrade = trade(); });
  assert.deepEqual(validateNfseModelAdditionalOptions(value, ctx), []);
  value.people.nif.recipient!.absenceReason = null;
  assert.throws(() => parseNfseModelAdditionalOptions(value));
  value.people.nif.recipient = { policy: 'REQUIRE_NIF', absenceReason: null };
  assert.deepEqual(validateNfseModelAdditionalOptions(value, ctx), []);
  const inactive = normalizeNfseModelAdditionalOptions(value, context())!;
  assert.equal(inactive.people.nif.recipient, null); assert.equal(inactive.service.foreignTrade, null);
});

test('all construction and event branches require explicit rules and real event dates', () => {
  for (const nationalServiceCode of NFSE_CONSTRUCTION_CODES) {
    assert(validateNfseModelAdditionalOptions(createDefaultNfseModelAdditionalOptions(), context({ nationalServiceCode })).some(issue => issue.includes('obra')));
    assert.deepEqual(validateNfseModelAdditionalOptions(changed(value => { value.service.construction = atIssue; }), context({ nationalServiceCode })), []);
  }
  const value = changed(value => { value.service.event = { source: 'FIXED', value: { description: 'EVENTO SINTÉTICO', startDate: '2026-11-10', endDate: '2026-11-11',
    identification: { kind: 'MUNICIPAL_ID', municipalId: 'SINTÉTICO', address: null } } }; });
  assert.deepEqual(validateNfseModelAdditionalOptions(value, context({ nationalServiceCode: '120101' })), []);
  if (value.service.event?.source === 'FIXED') value.service.event.value!.startDate = '2026-02-30';
  assert.throws(() => parseNfseModelAdditionalOptions(value));
});

test('Web address validation follows the actual country and rejects API-only activation', () => {
  const value = changed(value => { value.service.construction = { source: 'FIXED', value: { propertyTaxRegistration: null,
    identification: { kind: 'ADDRESS', workCode: null, cib: null, address: { postalCode: '00000000', street: 'RUA SINTÉTICA', number: 'S/N', complement: null, district: 'BAIRRO', city: null, stateProvince: null } } } }; });
  assert.deepEqual(validateNfseModelAdditionalOptions(value, context({ nationalServiceCode: '070201' })), []);
  const ctx = context({ nationalServiceCode: '070201' }); ctx.serviceOptions!.countryCode = 'PRT'; ctx.serviceOptions!.municipalityCode = null;
  value.service.foreignTrade = trade();
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('endereço')));
  value.service.rentedMovableAssets = atIssue;
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('exclusivo da API')));
});

test('official catalogs retain full domains and validate against canonical currency IDs', () => {
  assert.equal(nfseCurrencyOptions.length, 249); assert.equal(new Set(nfseCurrencyOptions.map(row => row.value)).size, 249);
  assert.equal(nfseProviderSupportOptions.length, 8); assert.equal(nfseRecipientSupportOptions.length, 26);
  assert(snapshot.provenance); assert(nfseCurrencyOptions.some(row => row.value === '220' && row.label.includes('DOLAR')));
  const value = changed(value => { value.service.foreignTrade = trade(); });
  const ctx = context({ issTreatment: 'EXPORTACAO' });
  assert.deepEqual(validateNfseModelAdditionalOptions(value, ctx), []);
  value.service.foreignTrade!.currencyCode = '999';
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('Banco Central')));
  value.service.foreignTrade!.currencyCode = '220'; value.service.foreignTrade!.temporaryGoods = '2';
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('declaração')));
  value.service.foreignTrade!.importDeclaration = atIssue;
  assert.deepEqual(validateNfseModelAdditionalOptions(value, ctx), []);
});

test('IBS references and property branches are conditional and normalize centrally', () => {
  const ctx = context(); ctx.serviceOptions = { ...ctx.serviceOptions!, includeIbsCbs: true, operationType: '2' }; ctx.operationIndicatorCode = '020101';
  const value = createDefaultNfseModelAdditionalOptions();
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('imóvel')));
  assert(validateNfseModelAdditionalOptions(value, ctx).some(issue => issue.includes('referências')));
  value.service.property = { municipality: atIssue, units: atIssue, originalDueDate: null }; value.service.operationReferences = atIssue; value.people.personalUse = false;
  assert.deepEqual(validateNfseModelAdditionalOptions(value, ctx), []);
  const normalized = normalizeNfseModelAdditionalOptions(value, context())!;
  assert.equal(normalized.service.property, null); assert.equal(normalized.service.operationReferences, null); assert.equal(normalized.people.personalUse, null);
  const key = '0'.repeat(50); value.service.operationReferences = { source: 'FIXED', value: [key, key] };
  assert.throws(() => parseNfseModelAdditionalOptions(value));
});

test('review describes closed numeric options by contextual key and loaded catalog', () => {
  assert.equal(describeNfsePresetCode('simpleNationalOption', '3'), '3 · Optante · ME/EPP');
  assert.equal(describeNfsePresetCode('simpleNationalAssessment', '1'), '1 · Tributos federais e ISSQN no Simples Nacional');
  assert.equal(describeNfsePresetCode('governmentEntityType', '4'), '4 · Município');
  assert.equal(describeNfsePresetCode('pisCofinsCst', '01'), '01 · Tributável com alíquota básica');
  assert.equal(describeNfsePresetCode('categoryCode', '01', ['deduction'], undefined, undefined, 'PRODUCTION_20260209'), '01 · Alimentação, bebidas e frigobar');
  assert.equal(describeNfsePresetCode('categoryCode', '101', ['reimbursementDocuments'], undefined, undefined, 'HOMOLOGATION_20261020'), '101 · Intermediação imobiliária');
  const rows = nfsePresetReviewRows({ simpleNationalOption: '3', providerPartnerLabel: 'PRESTADOR SINTÉTICO', providerPartner: { source: 'FIXED', value: id } });
  assert(!rows.some(row => row.value === 'PRESTADOR SINTÉTICO')); assert(!rows.some(row => row.value === id));
  assert.equal(describeNfsePresetCode('nationalServiceCode', '080201', [], { nationalServices: [{ code: '080201', description: 'Ensino técnico' }], nbs: [], operationIndicators: [] }), '080201 · Ensino técnico');
});
