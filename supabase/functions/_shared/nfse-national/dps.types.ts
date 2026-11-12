export interface NationalParty {
  taxId: { type: 'CPF' | 'CNPJ'; value: string };
  name?: string;
  municipalRegistration?: string;
  address?: {
    municipalityCode: string;
    postalCode: string;
    street: string;
    number: string;
    district: string;
    complement?: string;
  };
  email?: string;
  phone?: string;
}

/** All fiscal choices must originate from the authorized, confirmed backend snapshot. */
export interface NationalDpsInput {
  environment: 'HOMOLOGACAO' | 'PRODUCAO';
  purpose: 'REGULAR';
  issuedAt: string;
  applicationVersion: string;
  series: string;
  number: string;
  competence: string;
  issuerMunicipalityCode: string;
  issuer: NationalParty & {
    simpleNationalOption: '1' | '2' | '3';
    simpleNationalAssessment?: '1' | '2' | '3';
    specialTaxRegime: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '9';
  };
  recipient: NationalParty & { name: string };
  service: {
    municipalityCode: string;
    nationalTaxCode: string;
    municipalTaxCode?: string;
    nbs?: string;
    description: string;
    complementaryInfo?: string;
  };
  values: {
    serviceAmount: string;
    receivedAmount?: string;
    issTaxation: '1' | '2' | '4';
    immunityType?: '1' | '2' | '3' | '4' | '5';
    issRetention: '1' | '2';
    issRate?: string;
    totalTaxes:
      | { mode: 'AMOUNTS'; federal: string; state: string; municipal: string }
      | { mode: 'PERCENTAGES'; federal: string; state: string; municipal: string }
      | { mode: 'SIMPLE_NATIONAL_PERCENTAGE'; percentage: string };
  };
  /** Minimal domestic IBS/CBS declaration; classifications must be reviewed, never inferred. */
  ibscbs?: {
    personalUse: '0' | '1';
    operationCode: string;
    recipientIsAcquirer: true;
    cst: string;
    classificationCode: string;
    /** Restricted municipal lecture subset; omitted for existing student operations. */
    governmentPurchase?: { operationType: '1' | '4'; entityType: '4' };
  };
  substitution?: {
    originalAccessKey: string;
    reasonCode: '01' | '02' | '03' | '04' | '05' | '99';
    reason: string;
  };
  review: {
    recipientConfirmed: true;
    competenceConfirmed: true;
    classificationConfirmed: true;
    ibscbs: 'NOT_APPLICABLE_CONFIRMED' | 'DECLARED_CONFIRMED' | 'SYNTHETIC_PILOT_OMISSION';
    federalRetentions: 'NONE_CONFIRMED';
    deductionsAndDiscounts: 'NONE_CONFIRMED';
  };
}
