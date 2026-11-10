export type Rule<T> = { source: 'FIXED'; value: T } | { source: 'AT_ISSUANCE'; value: null };
export interface NifRule { policy: 'FROM_PARTNER' | 'REQUIRE_NIF' | 'WITHOUT_NIF'; absenceReason: '1' | '2' | null }
export interface ServiceAddress {
  postalCode: string; street: string; number: string; complement: string | null;
  district: string | null; city: string | null; stateProvince: string | null;
}
export interface PropertyUnit {
  unitKey: string; propertyTaxRegistration: string | null;
  identification: { kind: 'CIB' | 'ADDRESS'; cib: string | null; address: ServiceAddress | null };
}
export interface Construction {
  propertyTaxRegistration: string | null;
  identification: { kind: 'WORK_CODE' | 'CIB' | 'ADDRESS'; workCode: string | null; cib: string | null; address: ServiceAddress | null };
}
export interface ServiceEvent {
  description: string; startDate: string; endDate: string;
  identification: { kind: 'MUNICIPAL_ID' | 'ADDRESS'; municipalId: string | null; address: ServiceAddress | null };
}
export interface ForeignTrade {
  provisionMode: '1' | '2' | '3' | '4';
  relationship: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '9';
  currencyCode: string; serviceAmount: Rule<string>;
  providerSupport: '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08';
  recipientSupport: string; // closed official domain 01..26
  temporaryGoods: '1' | '2' | '3';
  importDeclaration: Rule<string> | null; exportRegistration: Rule<string> | null;
  shareWithMdic: boolean;
}
export interface NfseModelAdditionalOptions {
  version: 1;
  people: {
    destinationLocation: 'FROM_PARTNER' | 'BRASIL' | 'EXTERIOR' | null;
    personalUse: boolean | null;
    providerPartner: Rule<string> | null;
    readonly providerPartnerLabel?: string | null;
    providerLocation: 'FROM_PARTNER' | 'BRASIL' | 'EXTERIOR' | null;
    emissionReason: '1' | '2' | '3' | '4' | null;
    rejectedInvoiceReference: Rule<string> | null;
    nif: { provider: NifRule | null; recipient: NifRule | null; destination: NifRule | null; intermediary: NifRule | null };
  };
  service: {
    municipalServiceCode: Rule<string> | null;
    internalContributorCode: Rule<string> | null;
    construction: Rule<Construction> | null;
    property: { municipality: Rule<string>; units: Rule<PropertyUnit[]>; originalDueDate: Rule<string> | null } | null;
    event: Rule<ServiceEvent> | null;
    foreignTrade: ForeignTrade | null;
    operationReferences: Rule<string[]> | null;
    orderItems: Rule<string[]> | null;
    rentedMovableAssets: Rule<{ ncmCode: string; description: string; quantity: string }[]> | null;
  };
}
// UI-only incomplete draft. Persistence always passes through the structural parser.
export type NfseAdditionalDraftValue<T> = T extends readonly (infer U)[] ? NfseAdditionalDraftValue<U>[]
  : T extends object ? { -readonly [K in keyof T]: NfseAdditionalDraftValue<T[K]> } : T | null;
export type NfseModelAdditionalDraft = NfseAdditionalDraftValue<NfseModelAdditionalOptions>;
