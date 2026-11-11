import classifications from './classification-data';
import credits from './presumed-credits.json';
export { default as nfseIbsCbsCatalogProvenance } from './provenance.json';

export interface NfseIbsCbsClassification {
  cst: string;
  cstName: string;
  classificationCode: string;
  name: string;
  shortName: string | null;
  cstValidFrom: string | null;
  cstValidUntil: string | null;
  validFrom: string | null;
  validUntil: string | null;
  publishedAt: string | null;
  flags: Readonly<Record<string, boolean>>;
  classificationFlags: Readonly<Record<string, boolean>>;
  ibsReductionPercent: string;
  cbsReductionPercent: string;
  rateType: number | null;
  legalReference: string | null;
}

export interface NfsePresumedCredit {
  code: string;
  name: string;
  nfse: boolean;
  appropriationByDfe: boolean;
  appropriationByEvent: boolean;
  deductsPresumedCredit: boolean;
  paymentDeclaration: boolean;
  ibs: boolean;
  ibsValidFrom: string | null;
  ibsValidUntil: string | null;
  cbs: boolean;
  cbsValidFrom: string | null;
  cbsValidUntil: string | null;
}

export const nfseIbsCbsClassifications: readonly NfseIbsCbsClassification[] = Object.freeze(classifications);
export const nfsePresumedCredits: readonly NfsePresumedCredit[] = Object.freeze(credits);

export function isNfseClassificationActive(entry: NfseIbsCbsClassification, date: string) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || !entry.classificationFlags.IndNfse) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  return [entry.cstValidFrom, entry.validFrom].every(start => start === null || start.slice(0, 10) <= date)
    && [entry.cstValidUntil, entry.validUntil].every(end => end === null || end.slice(0, 10) >= date);
}
