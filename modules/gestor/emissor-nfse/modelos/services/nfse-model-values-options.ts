import type { NfseModelValuesDraft, NfseModelValuesOptions } from './nfse-model-values.types';
import { amountIsNone, invalidValues, noNfseAmount, parseNfseAmountRule, parseNfseDocumentRules,
  parseNfsePrincipalAmountRule, valuesChoice, valuesDecimal, valuesOptionalDecimal, valuesRecord, valuesText, valuesUuid } from './nfse-model-values-rules';
import { parseNfseFederalValues, parseNfseIbsCbsValues, parseNfseMunicipalValues, parseNfseTransparency } from './nfse-model-values-tax-groups';
export type { NfseModelValuesOptions, NfseModelValuesDraft, NfseValuesContext, NfseValuesCatalogs,
  NfseAmountRule, NfseDocumentRule } from './nfse-model-values.types';
export { isNfseModelValuesOptionsComplete, validateNfseModelValuesOptions } from './nfse-model-values-validation';

/** Visible source strategies only; no default classification, rate or fiscal choice. */
export function createEmptyNfseModelValuesOptions(): NfseModelValuesDraft {
  return {
    version: 1, serviceAmount: { source: 'RECEIPTS', fixedAmount: null },
    intermediaryAmount: noNfseAmount(), unconditionalDiscount: noNfseAmount(), conditionalDiscount: noNfseAmount(),
    iss: { specialTaxRegime: 'FROM_ESTABLISHMENT', suspensionType: null, suspensionProcessNumber: null,
      retention: null, rateSource: 'FROM_RULES', ratePercent: null, benefitId: null, benefitReduction: noNfseAmount() },
    deduction: { mode: 'NONE', value: null, documents: [] },
    federal: { mode: 'FROM_ESTABLISHMENT', pisCofinsCst: null, base: noNfseAmount(), pisRatePercent: null,
      cofinsRatePercent: null, retentionType: null, withheldCp: noNfseAmount(), withheldIrrf: noNfseAmount(), withheldSocialContributions: noNfseAmount() },
    ibscbs: null,
    transparency: { mode: null, federal: noNfseAmount(), state: noNfseAmount(), municipal: noNfseAmount(),
      federalPercent: null, statePercent: null, municipalPercent: null, simpleNationalPercent: null },
    rental: null,
  };
}
function deduction(value: unknown): NfseModelValuesOptions['deduction'] {
  const r = valuesRecord(value, ['mode', 'value', 'documents']);
  const mode = valuesChoice(r.mode, ['NONE', 'FIXED', 'PERCENTAGE', 'DOCUMENTS']);
  const documents = parseNfseDocumentRules(r.documents);
  const amount = valuesOptionalDecimal(r.value, mode === 'PERCENTAGE' ? 'PERCENT' : 'MONEY');
  if (((mode === 'FIXED' || mode === 'PERCENTAGE') !== (amount !== null))
    || ((mode === 'DOCUMENTS') !== (documents.length > 0))) return invalidValues();
  return { mode, value: amount, documents };
}
function rental(value: unknown): NfseModelValuesOptions['rental'] {
  if (value === null) return null;
  const r = valuesRecord(value, ['ownershipPercent', 'totalOperation', 'unconditionalDiscount', 'conditionalDiscount', 'unitAdjustments']);
  if (!Array.isArray(r.unitAdjustments) || r.unitAdjustments.length > 495) return invalidValues();
  return { ownershipPercent: valuesDecimal(r.ownershipPercent, 'PERCENT'),
    totalOperation: parseNfsePrincipalAmountRule(r.totalOperation),
    unconditionalDiscount: parseNfseAmountRule(r.unconditionalDiscount, ['TOTAL_OPERATION']),
    conditionalDiscount: parseNfseAmountRule(r.conditionalDiscount, ['TOTAL_OPERATION']),
    unitAdjustments: r.unitAdjustments.map(item => {
      const a = valuesRecord(item, ['unitReference', 'type', 'description', 'amount']);
      return { unitReference: valuesUuid(a.unitReference), type: valuesChoice(a.type, ['01', '02', '03', '04', '99']),
        description: valuesText(a.description, 150), amount: parseNfseAmountRule(a.amount, ['TOTAL_OPERATION']) };
    }) };
}
/** GET is structural: historical models never depend on today's catalog or issuer config. */
export function parseNfseModelValuesOptions(value: unknown): NfseModelValuesOptions | null {
  if (value === null || value === undefined) return null;
  const r = valuesRecord(value, ['version', 'serviceAmount', 'intermediaryAmount', 'unconditionalDiscount', 'conditionalDiscount',
    'iss', 'deduction', 'federal', 'ibscbs', 'transparency', 'rental']);
  if (r.version !== 1) return invalidValues();
  const s = valuesRecord(r.serviceAmount, ['source', 'fixedAmount']);
  const source = valuesChoice(s.source, ['RECEIPTS', 'FIXED', 'RENTAL_SHARE']);
  if (source !== 'FIXED' && s.fixedAmount !== null) return invalidValues();
  const result: NfseModelValuesOptions = {
    version: 1, serviceAmount: { source, fixedAmount: source === 'FIXED' ? valuesDecimal(s.fixedAmount, 'MONEY') : null },
    intermediaryAmount: parseNfseAmountRule(r.intermediaryAmount, ['SERVICE']),
    unconditionalDiscount: parseNfseAmountRule(r.unconditionalDiscount, ['SERVICE']),
    conditionalDiscount: parseNfseAmountRule(r.conditionalDiscount, ['SERVICE']),
    iss: parseNfseMunicipalValues(r.iss), deduction: deduction(r.deduction), federal: parseNfseFederalValues(r.federal),
    ibscbs: parseNfseIbsCbsValues(r.ibscbs), transparency: parseNfseTransparency(r.transparency), rental: rental(r.rental),
  };
  if ((source === 'RENTAL_SHARE') !== (result.rental !== null)
    || (source === 'RENTAL_SHARE' && ![result.unconditionalDiscount, result.conditionalDiscount].every(amountIsNone))) return invalidValues();
  return result;
}
export function serializeNfseModelValuesOptions(value: unknown): NfseModelValuesOptions | null {
  const result = parseNfseModelValuesOptions(value);
  if (result === null) return null;
  const stripLabels = (documents: NfseModelValuesOptions['deduction']['documents']) => documents.map(document => {
    const { supplierPartnerLabel: _label, ...fields } = document;
    return fields;
  });
  return { ...result, deduction: { ...result.deduction, documents: stripLabels(result.deduction.documents) },
    ibscbs: result.ibscbs === null ? null : { ...result.ibscbs, reimbursementDocuments: stripLabels(result.ibscbs.reimbursementDocuments) } };
}
