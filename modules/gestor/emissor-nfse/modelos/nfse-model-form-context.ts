import type { NfseScope, NfseIssTreatment } from '../types/nfse.types';
import type { NfseModelPeopleOptions } from './services/nfse-model-people-options';
import type { NfseModelServiceOptions } from './services/nfse-model-service-options';
import type { NfseModelIssuerMetadata } from './services/nfse-model-issuer.service-core';
import type { NfseValuesContext } from './services/nfse-model-values.types';
import type { NfseModelPresetContext } from './services/nfse-model-preset-context';

interface ContextFields {
  peopleOptions: NfseModelPeopleOptions | null;
  serviceOptions: NfseModelServiceOptions | null;
  issTreatment: NfseIssTreatment | '';
  nationalServiceCode: string;
  nbsCode: string;
}

/** Eligibility date for the configured strategy, never the month of financial receipts. */
export function getNfseModelReferenceDate(people: NfseModelPeopleOptions | null, now = new Date()): string {
  if (!people) return '';
  if (people.competenceMode === 'FIXED_DATE') return people.competenceDate || '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Maceio',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value || '').join('-');
}

export function createNfseModelValuesContext(scope: NfseScope | null, fields: ContextFields,
  issuer?: NfseModelIssuerMetadata, now = new Date()): NfseValuesContext {
  const people = fields.peopleOptions;
  const simple = people?.simpleNationalOption;
  const option = simple === 'FROM_ESTABLISHMENT' ? issuer?.opSimpNac || null : simple || null;
  const assessment = people?.simpleNationalAssessment;
  const resolvedAssessment = assessment === 'FROM_ESTABLISHMENT' || (assessment === null && simple === 'FROM_ESTABLISHMENT')
    ? issuer?.regApTribSN || null : assessment || null;
  return { includeIbsCbs: fields.serviceOptions?.includeIbsCbs ?? null,
    simpleNationalOption: option, simpleNationalAssessment: option === '3' ? resolvedAssessment : null,
    issuerRole: people?.issuerRole || 'PROVIDER',
    recipientAvailable: Boolean(people && (people.version === 2 || people.issuerRole === 'RECIPIENT' || people.recipientLocation !== 'NOT_INFORMED')),
    intermediaryAvailable: Boolean(people && (people.issuerRole === 'INTERMEDIARY'
      || (people.version === 2 ? people.intermediarySource === 'AT_ISSUANCE'
        : people.intermediaryLocation !== 'NOT_INFORMED' && people.intermediaryPartnerId))),
    issTreatment: fields.issTreatment || null,
    profile: scope?.environment === 'PRODUCAO' ? 'PRODUCTION_20260209' : 'HOMOLOGATION_20261020',
    competenceDate: getNfseModelReferenceDate(people, now), nationalServiceCode: fields.nationalServiceCode,
    nbsCode: fields.nbsCode, propertyUnits: null };
}

export function createNfseModelPresetContext(scope: NfseScope | null,
  fields: ContextFields & { operationIndicatorCode: string }, issuer?: NfseModelIssuerMetadata): NfseModelPresetContext {
  return { environment: scope?.environment || 'HOMOLOGACAO', nationalServiceCode: fields.nationalServiceCode,
    nbsCode: fields.nbsCode, operationIndicatorCode: fields.operationIndicatorCode,
    issTreatment: fields.issTreatment, serviceOptions: fields.serviceOptions, peopleOptions: fields.peopleOptions,
    issuerSimpleNationalOption: issuer?.opSimpNac || null, issuerSimpleNationalAssessment: issuer?.regApTribSN || null };
}
