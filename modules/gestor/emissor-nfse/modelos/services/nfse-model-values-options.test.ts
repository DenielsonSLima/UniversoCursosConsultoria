import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyNfseModelValuesOptions, parseNfseModelValuesOptions, serializeNfseModelValuesOptions } from './nfse-model-values-options';
import { noNfseAmount } from './nfse-model-values-rules';
import { isNfseCreditEligible, isNfseModelValuesOptionsComplete, validateNfseModelValuesOptions } from './nfse-model-values-validation';
import type { NfseDocumentRule, NfseModelValuesOptions, NfseValuesCatalogs, NfseValuesContext } from './nfse-model-values.types';
import { nfseIbsCbsClassifications, nfsePresumedCredits } from '../catalogs/nfse-ibscbs.catalog';

const context: NfseValuesContext = { includeIbsCbs: false, simpleNationalOption: '3', simpleNationalAssessment: '1',
  issuerRole: 'PROVIDER', recipientAvailable: true, intermediaryAvailable: false, issTreatment: 'TRIBUTAVEL',
  profile: 'PRODUCTION_20260209', competenceDate: '2026-11-10' };
const catalogs: NfseValuesCatalogs = { classifications: nfseIbsCbsClassifications, credits: nfsePresumedCredits };
const complete = (): NfseModelValuesOptions => {
  const draft = createEmptyNfseModelValuesOptions();
  return { ...draft, iss: { ...draft.iss, suspensionType: 'NONE', retention: 'NONE' },
    transparency: { ...draft.transparency, mode: 'PERCENTAGES', federalPercent: '0', statePercent: '0', municipalPercent: '0' } };
};
const document = (): NfseDocumentRule => ({ source: 'LINKED_OPERATION_DOCUMENTS', documentType: 'NFE',
  categoryCode: '02', categoryDescription: null, documentDescription: null, allocationMode: 'ELIGIBLE_AMOUNT',
  allocationValue: null, supplierSource: 'DOCUMENT', supplierPartnerId: null });

test('legacy null and historical GET remain structural while active save checks current rules', () => {
  assert.equal(parseNfseModelValuesOptions(null), null);
  assert.equal(serializeNfseModelValuesOptions(undefined), null);
  assert.equal(isNfseModelValuesOptionsComplete(createEmptyNfseModelValuesOptions(), context, catalogs), false);
  const value = complete();
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), true);
  value.transparency.mode = 'NOT_INFORMED';
  value.transparency.federalPercent = value.transparency.statePercent = value.transparency.municipalPercent = null;
  assert.deepEqual(parseNfseModelValuesOptions(value), value);
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), false);
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, simpleNationalAssessment: '2' }, catalogs), false);
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, simpleNationalOption: '2' }, catalogs), true);
});

test('unresolved issuer tax metadata blocks eligibility without changing historical GET', () => {
  const value = complete();
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, simpleNationalOption: null }, catalogs), false);
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, simpleNationalAssessment: null }, catalogs), false);
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, simpleNationalOption: '1', simpleNationalAssessment: null }, catalogs), true);
  assert.deepEqual(parseNfseModelValuesOptions(value), value);
});

test('explicit federal CP or IRRF does not invent an optional PIS/COFINS group', () => {
  const value = complete();
  value.federal.mode = 'EXPLICIT';
  value.federal.withheldIrrf = { source: 'FIXED', value: '1.23', base: null };
  const otherRegime = { ...context, simpleNationalOption: '1' as const };
  assert.equal(isNfseModelValuesOptionsComplete(value, otherRegime, catalogs), true);
  assert.equal(serializeNfseModelValuesOptions(value)?.federal.pisCofinsCst, null);
  assert.throws(() => parseNfseModelValuesOptions({ ...value, federal: { ...value.federal, pisRatePercent: '1' } }));
});

test('canonical decimal strings preserve all money digits and reject coercions or inactive values', () => {
  const value = complete();
  value.serviceAmount = { source: 'FIXED', fixedAmount: '999999999999999.99' };
  assert.equal(serializeNfseModelValuesOptions(value)?.serviceAmount.fixedAmount, '999999999999999.99');
  for (const fixedAmount of ['1,00', '01.00', '1e2', '-1', 'NaN', '1.001', '1000000000000000', 100]) {
    assert.throws(() => parseNfseModelValuesOptions({ ...value, serviceAmount: { source: 'FIXED', fixedAmount } }));
  }
  assert.throws(() => parseNfseModelValuesOptions({ ...value, unconditionalDiscount: { source: 'NONE', value: '10', base: null } }));
  assert.throws(() => parseNfseModelValuesOptions({ ...value, serviceAmount: { source: 'RECEIPTS', fixedAmount: '10' } }));
});

test('SN3 assessment1 blocks free federal values and non-retained ISS rate without changing stored history', () => {
  const value = complete();
  value.iss.rateSource = 'FIXED'; value.iss.ratePercent = '3.54';
  assert.equal(parseNfseModelValuesOptions(value)?.iss.ratePercent, '3.54');
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), false);
  value.iss.rateSource = 'FROM_RULES'; value.iss.ratePercent = null;
  value.federal.mode = 'EXPLICIT'; value.federal.pisCofinsCst = '00'; value.federal.retentionType = '0';
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), false);
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, simpleNationalOption: '1' }, catalogs), true);
  value.iss.retention = 'INTERMEDIARY';
  assert(validateNfseModelValuesOptions(value, context, catalogs).some(issue => issue.includes('intermediário')));
});

test('a fixed ISS rate is unavailable for MEI, immunity, export and non-incidence', () => {
  const value = complete(); value.iss.rateSource = 'FIXED'; value.iss.ratePercent = '3.54';
  const otherRegime = { ...context, simpleNationalOption: '1' as const, simpleNationalAssessment: null };
  assert.equal(isNfseModelValuesOptionsComplete(value, otherRegime, catalogs), true);
  for (const issTreatment of ['IMUNIDADE', 'EXPORTACAO', 'NAO_INCIDENCIA'] as const) {
    assert.equal(isNfseModelValuesOptionsComplete(value, { ...otherRegime, issTreatment }, catalogs), false);
  }
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...otherRegime, simpleNationalOption: '2' }, catalogs), false);
  assert.equal(parseNfseModelValuesOptions(value)?.iss.ratePercent, '3.54', 'Historical reads remain structural');
});

test('a historical municipal benefit is preserved on GET but cannot activate without its official catalog', () => {
  const value = complete(); value.iss.benefitId = '00000000000001';
  assert.equal(parseNfseModelValuesOptions(value)?.iss.benefitId, '00000000000001');
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), false);
  assert(validateNfseModelValuesOptions(value, context, catalogs).some(issue => issue.includes('lista oficial do município')));
  value.iss.benefitId = null;
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), true);
});

test('linked-document strategies keep exact profile categories and strip only DTO labels', () => {
  const value = complete();
  const rule = { ...document(), supplierSource: 'FIXED_PARTNER' as const,
    supplierPartnerId: '00000000-0000-0000-0000-000000000001', supplierPartnerLabel: 'Fornecedor sintético' };
  value.deduction = { mode: 'DOCUMENTS', value: null, documents: [rule] };
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), false, 'A fixed historical supplier must be explicitly converted to an issuance strategy');
  assert.equal(parseNfseModelValuesOptions(value)?.deduction.documents[0].supplierPartnerId, rule.supplierPartnerId);
  const serialized = serializeNfseModelValuesOptions(value)!;
  assert.equal('supplierPartnerLabel' in serialized.deduction.documents[0], false);
  assert.equal(value.deduction.documents[0].supplierPartnerLabel, 'Fornecedor sintético');
  for (const change of [{ invoiceKey: 'SYNTHETIC' }, { issueDate: '2026-11-10' }, { amount: '1' }, { supplierName: 'SYNTHETIC' }]) {
    assert.throws(() => serializeNfseModelValuesOptions({ ...value, deduction: { ...value.deduction, documents: [{ ...rule, ...change }] } }));
  }
  value.deduction.documents[0] = document();
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), true);
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, profile: 'HOMOLOGATION_20261020' }, catalogs), false);
  value.deduction.documents[0].categoryCode = '2';
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, profile: 'HOMOLOGATION_20261020' }, catalogs), true);
});

test('transparency keeps three percentage scalars distinct from monetary rules', () => {
  const value = complete();
  value.transparency.federalPercent = '1.23'; value.transparency.statePercent = '0'; value.transparency.municipalPercent = '4.56';
  assert.deepEqual(serializeNfseModelValuesOptions(value)?.transparency, value.transparency);
  assert.throws(() => parseNfseModelValuesOptions({ ...value, transparency: { ...value.transparency, federal: { source: 'FIXED', value: '1', base: null } } }));
  value.transparency = { ...value.transparency, mode: 'SIMPLE_NATIONAL_PERCENTAGE', federalPercent: null,
    statePercent: null, municipalPercent: null, simpleNationalPercent: '6' };
  assert.equal(isNfseModelValuesOptionsComplete(value, context, catalogs), true);
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, simpleNationalOption: '1' }, catalogs), false);
});

test('IBS/CBS classifications use dated official catalog and dependent flags without selecting tax codes', () => {
  const value = complete();
  const enabled = { ...context, includeIbsCbs: true };
  assert.equal(isNfseModelValuesOptionsComplete(value, enabled, catalogs), false);
  value.ibscbs = { cst: '000', classificationCode: '000001', presumedCreditCode: null,
    regularTaxation: null, deferral: null, reimbursementDocuments: [] };
  assert.equal(isNfseModelValuesOptionsComplete(value, enabled, catalogs), true);
  const futureCatalog = { ...catalogs, classifications: catalogs.classifications.map(row => ({ ...row, validFrom: '2027-01-01' })) };
  assert.equal(isNfseModelValuesOptionsComplete(value, enabled, futureCatalog), false);
  assert.deepEqual(parseNfseModelValuesOptions(value)?.ibscbs, value.ibscbs);
  const dependent = { ...catalogs, classifications: catalogs.classifications.map(row => row.classificationCode === '000001'
    ? { ...row, flags: { ...row.flags, IndDiferimento: true }, classificationFlags: { ...row.classificationFlags, IndTribRegular: true } } : row) };
  assert.equal(isNfseModelValuesOptionsComplete(value, enabled, dependent), false);
  value.ibscbs.deferral = { statePercent: '10', municipalPercent: '20', cbsPercent: '30' };
  value.ibscbs.regularTaxation = { cst: '200', classificationCode: '200004' };
  assert.equal(isNfseModelValuesOptionsComplete(value, enabled, dependent), true);
  assert.throws(() => parseNfseModelValuesOptions({ ...value, ibscbs: { ...value.ibscbs, classificationCode: '200004' } }));
});

test('event-only presumed credits are not offered as generic invoice credits', () => {
  assert.equal(nfsePresumedCredits.filter(row => row.nfse).length, 2);
  for (const credit of nfsePresumedCredits.filter(row => row.nfse)) {
    assert.equal(isNfseCreditEligible(credit, '2026-11-10'), false);
    assert.equal(isNfseCreditEligible(credit, '2027-01-01'), false);
  }
});

test('API-only rental cannot activate a Web model and never double-applies discounts', () => {
  const value = complete();
  value.serviceAmount = { source: 'RENTAL_SHARE', fixedAmount: null };
  value.rental = { ownershipPercent: '50', totalOperation: { source: 'RECEIPTS', fixedAmount: null },
    unconditionalDiscount: noNfseAmount(), conditionalDiscount: noNfseAmount(), unitAdjustments: [] };
  assert.equal(parseNfseModelValuesOptions(value)?.serviceAmount.source, 'RENTAL_SHARE');
  assert.equal(isNfseModelValuesOptionsComplete(value, { ...context, profile: 'HOMOLOGATION_20261020' }, catalogs), false);
  value.unconditionalDiscount = { source: 'FIXED', value: '1', base: null };
  assert.throws(() => parseNfseModelValuesOptions(value));
});
