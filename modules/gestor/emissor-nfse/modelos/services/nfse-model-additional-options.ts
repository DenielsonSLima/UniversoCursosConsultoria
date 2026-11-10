import type { NfseModelAdditionalOptions, NfseModelAdditionalDraft } from './nfse-model-additional.types';
import { object, optional, choice, rule, text, array, uuid, accessKey, date, nif, construction, propertyUnits, event, foreignTrade, references } from './nfse-model-additional.schema';

export type { NfseModelAdditionalOptions, NfseModelAdditionalDraft, Rule } from './nfse-model-additional.types';
export { normalizeNfseModelAdditionalOptions, isCompleteNfseModelAdditionalOptions, validateNfseModelAdditionalOptions } from './nfse-model-additional-validation';

export function createDefaultNfseModelAdditionalOptions(): NfseModelAdditionalDraft {
  return { version: 1, people: { destinationLocation: null, personalUse: null, providerPartner: null,
    providerLocation: null, emissionReason: null, rejectedInvoiceReference: null, nif: { provider: null, recipient: null, destination: null, intermediary: null } },
  service: { municipalServiceCode: null, internalContributorCode: null, construction: null, property: null,
    event: null, foreignTrade: null, operationReferences: null, orderItems: null, rentedMovableAssets: null } };
}

const schema = object({ version: choice([1]), people: object({ destinationLocation: optional(choice(['FROM_PARTNER', 'BRASIL', 'EXTERIOR'])),
  personalUse: optional(choice([true, false])), providerPartner: optional(rule(uuid)), providerLocation: optional(choice(['FROM_PARTNER', 'BRASIL', 'EXTERIOR'])), emissionReason: optional(choice(['1', '2', '3', '4'])),
  rejectedInvoiceReference: optional(rule(accessKey)), nif: object({ provider: optional(nif), recipient: optional(nif), destination: optional(nif), intermediary: optional(nif) }) }, { providerPartnerLabel: optional(text(300)) }),
service: object({ municipalServiceCode: optional(rule(text(3, /^[0-9]{3}$/))), internalContributorCode: optional(rule(text(20))),
  construction: optional(rule(construction)), property: optional(object({ municipality: rule(text(7, /^[0-9]{7}$/)), units: rule(propertyUnits), originalDueDate: optional(rule(date)) })),
  event: optional(rule(event)), foreignTrade: optional(foreignTrade), operationReferences: optional(rule(references)), orderItems: optional(rule(array(text(60), 99))),
  rentedMovableAssets: optional(rule(array(object({ ncmCode: text(8, /^[0-9]{8}$/), description: text(150), quantity: text(3, /^[0-9]{1,3}$/) }), 1000))) }) });

/** Historical DTO parsing is independent of today's catalog, taxpayer regime or profile. */
export function parseNfseModelAdditionalOptions(value: unknown): NfseModelAdditionalOptions | null {
  return value === null || value === undefined ? null : schema(value) as NfseModelAdditionalOptions;
}
export function serializeNfseModelAdditionalOptions(value: unknown): NfseModelAdditionalOptions | null {
  const parsed = parseNfseModelAdditionalOptions(value);
  if (parsed) Reflect.deleteProperty(parsed.people, 'providerPartnerLabel');
  return parsed;
}
