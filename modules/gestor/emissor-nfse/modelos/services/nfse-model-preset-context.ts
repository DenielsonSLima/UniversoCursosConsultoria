import type { NfseEnvironment, NfseIssTreatment } from '../../types/nfse.types';
import type { NfseModelServiceOptions } from './nfse-model-service-options';
import type { NfseModelPeopleOptions } from './nfse-model-people-options';

/** Scenario inputs only; no partner identity, financial value or credentials. */
export interface NfseModelPresetContext {
  environment: NfseEnvironment;
  nationalServiceCode: string;
  nbsCode: string;
  operationIndicatorCode: string;
  issTreatment: NfseIssTreatment | '';
  serviceOptions: NfseModelServiceOptions | null;
  peopleOptions: NfseModelPeopleOptions | null;
  issuerSimpleNationalOption: '1' | '2' | '3' | null;
  issuerSimpleNationalAssessment: '1' | '2' | '3' | null;
}
