import type { NfseModelValuesOptions } from './nfse-model-values.types';
import { amountIsNone, invalidValues, parseNfseAmountRule, parseNfseDocumentRules,
  valuesChoice, valuesCode, valuesOptionalDecimal, valuesRecord, valuesText } from './nfse-model-values-rules';

export const nfsePisCofinsCsts = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '49',
  '50', '51', '52', '53', '54', '55', '56', '60', '61', '62', '63', '64', '65', '66', '67',
  '70', '71', '72', '73', '74', '75', '98', '99'] as const;

export function parseNfseMunicipalValues(value: unknown): NfseModelValuesOptions['iss'] {
  const r = valuesRecord(value, ['specialTaxRegime', 'suspensionType', 'suspensionProcessNumber',
    'retention', 'rateSource', 'ratePercent', 'benefitId', 'benefitReduction']);
  const result: NfseModelValuesOptions['iss'] = {
    specialTaxRegime: valuesChoice(r.specialTaxRegime, ['FROM_ESTABLISHMENT', '0', '1', '2', '3', '4', '5', '6', '9']),
    suspensionType: valuesChoice(r.suspensionType, ['NONE', 'JUDICIAL', 'ADMINISTRATIVE']),
    suspensionProcessNumber: valuesText(r.suspensionProcessNumber, 30),
    retention: valuesChoice(r.retention, ['NONE', 'RECIPIENT', 'INTERMEDIARY']),
    rateSource: valuesChoice(r.rateSource, ['FROM_RULES', 'FIXED']),
    ratePercent: valuesOptionalDecimal(r.ratePercent, 'PERCENT'),
    benefitId: r.benefitId === null ? null : valuesCode(r.benefitId, /^[0-9]{14}$/),
    benefitReduction: parseNfseAmountRule(r.benefitReduction, ['SERVICE_AFTER_UNCONDITIONAL_AND_DEDUCTION']),
  };
  if ((result.suspensionType === 'NONE') !== (result.suspensionProcessNumber === null)
    || (result.rateSource === 'FROM_RULES') !== (result.ratePercent === null)
    || (result.benefitId === null && !amountIsNone(result.benefitReduction))) return invalidValues();
  return result;
}
export function parseNfseFederalValues(value: unknown): NfseModelValuesOptions['federal'] {
  const r = valuesRecord(value, ['mode', 'pisCofinsCst', 'base', 'pisRatePercent', 'cofinsRatePercent',
    'retentionType', 'withheldCp', 'withheldIrrf', 'withheldSocialContributions']);
  const result: NfseModelValuesOptions['federal'] = {
    mode: valuesChoice(r.mode, ['FROM_ESTABLISHMENT', 'EXPLICIT']),
    pisCofinsCst: r.pisCofinsCst === null ? null : valuesChoice(r.pisCofinsCst, nfsePisCofinsCsts),
    base: parseNfseAmountRule(r.base, ['SERVICE']),
    pisRatePercent: valuesOptionalDecimal(r.pisRatePercent, 'PERCENT'),
    cofinsRatePercent: valuesOptionalDecimal(r.cofinsRatePercent, 'PERCENT'),
    retentionType: r.retentionType === null ? null : valuesChoice(r.retentionType, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
    withheldCp: parseNfseAmountRule(r.withheldCp, ['SERVICE']),
    withheldIrrf: parseNfseAmountRule(r.withheldIrrf, ['SERVICE']),
    withheldSocialContributions: parseNfseAmountRule(r.withheldSocialContributions, ['SERVICE']),
  };
  if (result.mode === 'FROM_ESTABLISHMENT' && (result.pisCofinsCst !== null
    || result.pisRatePercent !== null || result.cofinsRatePercent !== null || result.retentionType !== null
    || ![result.base, result.withheldCp, result.withheldIrrf, result.withheldSocialContributions].every(amountIsNone))) return invalidValues();
  if (result.mode === 'EXPLICIT' && ((result.pisCofinsCst !== null && result.retentionType === null)
    || (result.pisCofinsCst === null && (!amountIsNone(result.base) || result.pisRatePercent !== null
      || result.cofinsRatePercent !== null || result.retentionType !== null)))) return invalidValues();
  return result;
}
function classification(value: unknown): { cst: string; classificationCode: string } {
  const r = valuesRecord(value, ['cst', 'classificationCode']);
  const result = { cst: valuesCode(r.cst, /^[0-9]{3}$/), classificationCode: valuesCode(r.classificationCode, /^[0-9]{6}$/) };
  if (!result.classificationCode.startsWith(result.cst)) return invalidValues();
  return result;
}
export function parseNfseIbsCbsValues(value: unknown): NfseModelValuesOptions['ibscbs'] {
  if (value === null) return null;
  const r = valuesRecord(value, ['cst', 'classificationCode', 'presumedCreditCode', 'regularTaxation', 'deferral', 'reimbursementDocuments']);
  let deferral: NonNullable<NfseModelValuesOptions['ibscbs']>['deferral'] = null;
  if (r.deferral !== null) {
    const d = valuesRecord(r.deferral, ['statePercent', 'municipalPercent', 'cbsPercent']);
    deferral = { statePercent: valuesOptionalDecimal(d.statePercent, 'PERCENT') ?? invalidValues(),
      municipalPercent: valuesOptionalDecimal(d.municipalPercent, 'PERCENT') ?? invalidValues(),
      cbsPercent: valuesOptionalDecimal(d.cbsPercent, 'PERCENT') ?? invalidValues() };
  }
  return { ...classification({ cst: r.cst, classificationCode: r.classificationCode }),
    presumedCreditCode: r.presumedCreditCode === null ? null : valuesCode(r.presumedCreditCode, /^[0-9]{2}$/),
    regularTaxation: r.regularTaxation === null ? null : classification(r.regularTaxation),
    deferral, reimbursementDocuments: parseNfseDocumentRules(r.reimbursementDocuments) };
}
export function parseNfseTransparency(value: unknown): NfseModelValuesOptions['transparency'] {
  const r = valuesRecord(value, ['mode', 'federal', 'state', 'municipal', 'federalPercent', 'statePercent', 'municipalPercent', 'simpleNationalPercent']);
  const result: NfseModelValuesOptions['transparency'] = {
    mode: valuesChoice(r.mode, ['AMOUNTS', 'PERCENTAGES', 'SIMPLE_NATIONAL_PERCENTAGE', 'NOT_INFORMED']),
    federal: parseNfseAmountRule(r.federal, ['SERVICE']), state: parseNfseAmountRule(r.state, ['SERVICE']),
    municipal: parseNfseAmountRule(r.municipal, ['SERVICE']),
    federalPercent: valuesOptionalDecimal(r.federalPercent, 'PERCENT'),
    statePercent: valuesOptionalDecimal(r.statePercent, 'PERCENT'),
    municipalPercent: valuesOptionalDecimal(r.municipalPercent, 'PERCENT'),
    simpleNationalPercent: valuesOptionalDecimal(r.simpleNationalPercent, 'PERCENT'),
  };
  const rules = [result.federal, result.state, result.municipal];
  const percentages = [result.federalPercent, result.statePercent, result.municipalPercent];
  if ((result.mode === 'AMOUNTS' && (rules.some(amountIsNone) || percentages.some(v => v !== null) || result.simpleNationalPercent !== null))
    || (result.mode !== 'AMOUNTS' && !rules.every(amountIsNone))
    || (result.mode === 'PERCENTAGES' && (percentages.some(v => v === null) || result.simpleNationalPercent !== null))
    || (result.mode !== 'PERCENTAGES' && percentages.some(v => v !== null))
    || ((result.mode === 'SIMPLE_NATIONAL_PERCENTAGE') !== (result.simpleNationalPercent !== null))) return invalidValues();
  return result;
}
