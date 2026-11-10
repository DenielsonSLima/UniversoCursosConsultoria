import type { NfseModelServiceOptions } from './services/nfse-model-service-options';
import type { NfseModelPeopleOptions } from './services/nfse-model-people-options';
import { createDefaultNfseModelServiceOptions, isNfseModelServiceOptionsComplete, requiresNfseOperationType } from './services/nfse-model-service-options';

export const emptyNfseModelServiceOptions = createDefaultNfseModelServiceOptions;
export { requiresNfseOperationType };

export function normalizeNfsePeopleOptions(options: NfseModelPeopleOptions, service: NfseModelServiceOptions | null): NfseModelPeopleOptions {
  return { ...options,
    ...(service?.includeIbsCbs !== true ? { recipientIsDestination: null, destinationPartnerId: null, destinationPartnerLabel: null } : {}),
    ...(service?.governmentPurchase === true ? { recipientLocation: 'BRASIL' as const } : {}),
  };
}

export function normalizeNfseServiceOptions(options: NfseModelServiceOptions, nationalServiceCode: string, issTreatment: string): NfseModelServiceOptions {
  const normalized = { ...options,
    municipalityCode: options.countryCode === 'BRA' ? options.municipalityCode : null,
    municipalityLabel: options.countryCode === 'BRA' ? options.municipalityLabel : null,
    exportResultCountryCode: issTreatment === 'EXPORTACAO' ? options.exportResultCountryCode : null,
    exportResultCountryLabel: issTreatment === 'EXPORTACAO' ? options.exportResultCountryLabel : null,
    governmentPurchase: options.includeIbsCbs === true ? options.governmentPurchase : null,
    governmentEntityType: options.includeIbsCbs === true && options.governmentPurchase === true ? options.governmentEntityType : null,
  };
  return { ...normalized, operationType: requiresNfseOperationType(normalized, nationalServiceCode) ? normalized.operationType : null };
}

export function isNfseServiceOptionsComplete(options: NfseModelServiceOptions | null | undefined, nationalServiceCode: string, operationIndicatorCode: string, issTreatment: string): boolean {
  return isNfseModelServiceOptionsComplete(options, issTreatment, nationalServiceCode, operationIndicatorCode);
}
