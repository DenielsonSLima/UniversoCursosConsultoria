import type { NfseScope } from '../types/nfse.types';
import type { NfseModelFormValues } from './NfseModelServiceFields';
import type { NfseModelIssuerMetadata } from './services/nfse-model-issuer.service-core';
import { normalizeNfsePeopleOptions, normalizeNfseServiceOptions } from './nfse-model-options-form';
import { createEmptyNfseModelValuesOptions } from './services/nfse-model-values-options';
import { createNfseModelPresetContext, createNfseModelValuesContext } from './nfse-model-form-context';
import { normalizeNfseModelAdditionalOptions } from './services/nfse-model-additional-options';

/** Clear inactive dependent choices on an explicit form edit, including unmounted steps. */
export function normalizeNfseModelDraft(fields: NfseModelFormValues, scope: NfseScope | null,
  issuer?: NfseModelIssuerMetadata): NfseModelFormValues {
  const next = { ...fields };
  if (next.serviceOptions) {
    next.serviceOptions = normalizeNfseServiceOptions(next.serviceOptions, next.nationalServiceCode, next.issTreatment);
    if (next.serviceOptions.includeIbsCbs === false) next.operationIndicatorCode = '';
  }
  if (next.peopleOptions) next.peopleOptions = normalizeNfsePeopleOptions(next.peopleOptions, next.serviceOptions);
  next.additionalOptions = normalizeNfseModelAdditionalOptions(next.additionalOptions,
    createNfseModelPresetContext(scope, next, issuer));
  if (next.valuesOptions) {
    next.valuesOptions = { ...next.valuesOptions,
      ...(next.serviceOptions?.includeIbsCbs !== true ? { ibscbs: null } : {}) };
    const context = createNfseModelValuesContext(scope, next, issuer);
    const federalInherited = context.simpleNationalOption === '2'
      || (context.simpleNationalOption === '3' && ['1', '2'].includes(context.simpleNationalAssessment || ''));
    if (federalInherited && next.valuesOptions.federal.mode !== 'FROM_ESTABLISHMENT') {
      next.valuesOptions.federal = createEmptyNfseModelValuesOptions().federal;
    }
  }
  return next;
}
