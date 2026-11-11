export type AmountBase = 'SERVICE' | 'SERVICE_AFTER_UNCONDITIONAL'
  | 'SERVICE_AFTER_UNCONDITIONAL_AND_DEDUCTION' | 'TOTAL_OPERATION';
export interface NfseAmountRule {
  source: 'NONE' | 'FIXED' | 'PERCENTAGE';
  value: string | null;
  base: AmountBase | null;
}
export interface NfsePrincipalAmountRule {
  source: 'RECEIPTS' | 'FIXED';
  fixedAmount: string | null;
}
export interface NfseDocumentRule {
  source: 'LINKED_OPERATION_DOCUMENTS';
  documentType: 'NATIONAL_NFSE' | 'NFE' | 'CTE' | 'OTHER_NATIONAL_DFE'
    | 'MUNICIPAL_NFSE' | 'NF_NFS' | 'OTHER_FISCAL' | 'NON_FISCAL';
  categoryCode: string;
  categoryDescription: string | null;
  documentDescription: string | null;
  allocationMode: 'ELIGIBLE_AMOUNT' | 'FIXED' | 'PERCENTAGE';
  allocationValue: string | null;
  supplierSource: 'DOCUMENT' | 'FIXED_PARTNER' | 'OMIT';
  supplierPartnerId: string | null;
  readonly supplierPartnerLabel?: string | null;
}
export interface NfseModelValuesOptions {
  version: 1;
  serviceAmount: { source: 'RECEIPTS' | 'FIXED' | 'RENTAL_SHARE'; fixedAmount: string | null };
  intermediaryAmount: NfseAmountRule;
  unconditionalDiscount: NfseAmountRule;
  conditionalDiscount: NfseAmountRule;
  iss: {
    specialTaxRegime: 'FROM_ESTABLISHMENT' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '9';
    suspensionType: 'NONE' | 'JUDICIAL' | 'ADMINISTRATIVE';
    suspensionProcessNumber: string | null;
    retention: 'NONE' | 'RECIPIENT' | 'INTERMEDIARY';
    rateSource: 'FROM_RULES' | 'FIXED';
    ratePercent: string | null;
    benefitId: string | null;
    benefitReduction: NfseAmountRule;
  };
  deduction: { mode: 'NONE' | 'FIXED' | 'PERCENTAGE' | 'DOCUMENTS'; value: string | null; documents: NfseDocumentRule[] };
  federal: {
    mode: 'FROM_ESTABLISHMENT' | 'EXPLICIT';
    pisCofinsCst: string | null;
    base: NfseAmountRule;
    pisRatePercent: string | null;
    cofinsRatePercent: string | null;
    retentionType: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | null;
    withheldCp: NfseAmountRule;
    withheldIrrf: NfseAmountRule;
    withheldSocialContributions: NfseAmountRule;
  };
  ibscbs: null | {
    cst: string;
    classificationCode: string;
    presumedCreditCode: string | null;
    regularTaxation: null | { cst: string; classificationCode: string };
    deferral: null | { statePercent: string; municipalPercent: string; cbsPercent: string };
    reimbursementDocuments: NfseDocumentRule[];
  };
  transparency: {
    mode: 'AMOUNTS' | 'PERCENTAGES' | 'SIMPLE_NATIONAL_PERCENTAGE' | 'NOT_INFORMED';
    federal: NfseAmountRule;
    state: NfseAmountRule;
    municipal: NfseAmountRule;
    federalPercent: string | null;
    statePercent: string | null;
    municipalPercent: string | null;
    simpleNationalPercent: string | null;
  };
  rental: null | {
    ownershipPercent: string;
    totalOperation: NfsePrincipalAmountRule;
    unconditionalDiscount: NfseAmountRule;
    conditionalDiscount: NfseAmountRule;
    unitAdjustments: { unitReference: string; type: '01' | '02' | '03' | '04' | '99'; description: string | null; amount: NfseAmountRule }[];
  };
}

/** Empty fiscal choices exist only while editing. They cannot be serialized. */
export type NfseModelValuesDraft = Omit<NfseModelValuesOptions, 'iss' | 'transparency'> & {
  iss: Omit<NfseModelValuesOptions['iss'], 'suspensionType' | 'retention'> & {
    suspensionType: NfseModelValuesOptions['iss']['suspensionType'] | null;
    retention: NfseModelValuesOptions['iss']['retention'] | null;
  };
  transparency: Omit<NfseModelValuesOptions['transparency'], 'mode'> & {
    mode: NfseModelValuesOptions['transparency']['mode'] | null;
  };
};
export interface NfseValuesClassification {
  cst: string;
  cstName: string;
  classificationCode: string;
  name: string;
  shortName?: string | null;
  cstValidFrom: string | null;
  cstValidUntil: string | null;
  validFrom: string | null;
  validUntil: string | null;
  flags: Readonly<Record<string, boolean>>;
  classificationFlags: Readonly<Record<string, boolean>>;
  ibsReductionPercent: string;
  cbsReductionPercent: string;
  legalReference?: string | null;
}
export interface NfseValuesCredit {
  code: string;
  name: string;
  nfse: boolean;
  ibs: boolean;
  ibsValidFrom: string | null;
  ibsValidUntil: string | null;
  cbsValidFrom: string | null;
  cbsValidUntil: string | null;
  cbs: boolean;
  appropriationByDfe: boolean;
  appropriationByEvent: boolean;
}
export interface NfseValuesCatalogs {
  classifications: readonly NfseValuesClassification[];
  credits: readonly NfseValuesCredit[];
}
export interface NfseValuesContext {
  includeIbsCbs: boolean | null;
  simpleNationalOption: '1' | '2' | '3' | null;
  simpleNationalAssessment: '1' | '2' | '3' | null;
  issuerRole: 'PROVIDER' | 'RECIPIENT' | 'INTERMEDIARY';
  recipientAvailable: boolean;
  intermediaryAvailable: boolean;
  issTreatment: 'TRIBUTAVEL' | 'IMUNIDADE' | 'EXPORTACAO' | 'NAO_INCIDENCIA' | null;
  profile: 'PRODUCTION_20260209' | 'HOMOLOGATION_20261020';
  competenceDate: string;
  nationalServiceCode?: string;
  nbsCode?: string;
  propertyUnits?: { source: 'FIXED' | 'AT_ISSUANCE'; unitKeys: readonly string[] } | null;
}
