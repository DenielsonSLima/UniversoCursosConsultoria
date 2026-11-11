import type { NfseModel, NfseScope } from '../../types/nfse.types';
import type { NfseModelIssuerMetadata } from '../services/nfse-model-issuer.service-core';
import { createDefaultNfseModelPeopleOptionsV2 } from '../services/nfse-model-people-options';
import { createDefaultNfseModelAdditionalOptions } from '../services/nfse-model-additional-options';
import type { NfseModelAdditionalOptions } from '../services/nfse-model-additional.types';
import { createEmptyNfseModelValuesOptions } from '../services/nfse-model-values-options';
import type { NfseModelValuesOptions } from '../services/nfse-model-values.types';

export const exportScope: NfseScope = { poloId: '00000000-0000-0000-0000-000000000001',
  contextKey: '00000000-0000-0000-0000-000000000099', environment: 'PRODUCAO', month: '2026-11' };
export const exportIssuer: NfseModelIssuerMetadata = { poloId: exportScope.poloId, name: 'UNIDADE SINTÉTICA', legalName: 'EMPRESA SINTÉTICA', cnpj: '00000000000000',
  address: { street: 'RUA DE TESTE', number: '1', complement: null, district: 'CENTRO', city: 'CIDADE SINTÉTICA', state: 'SE', postalCode: '00000000' },
  phone: '00000000000', email: 'teste@example.invalid', municipalityCode: '2803401', municipalRegistration: null,
  opSimpNac: '3', regApTribSN: '1', regEspTrib: '0', configurationVersion: 4 };
export const exportCatalogs = { nationalServices: [{ code: '080201', description: 'Instrução e treinamento' }],
  nbs: [{ code: '122020000', description: 'Educação técnica de nível médio' }], operationIndicators: [{ code: '030101', description: 'Serviço presencial no estabelecimento do fornecedor' }] };

/** Synthetic only. Contains no student, partner or fiscal document. */
export function exportModelFixture(): NfseModel {
  const draft = createEmptyNfseModelValuesOptions();
  const values: NfseModelValuesOptions = { ...draft,
    iss: { ...draft.iss, suspensionType: 'NONE', retention: 'NONE' },
    ibscbs: { cst: '000', classificationCode: '000001', presumedCreditCode: null, regularTaxation: null, deferral: null, reimbursementDocuments: [] },
    transparency: { ...draft.transparency, mode: 'AMOUNTS',
      federal: { source: 'FIXED', value: '0', base: null }, state: { source: 'FIXED', value: '0', base: null },
      municipal: { source: 'PERCENTAGE', value: '3.88', base: 'SERVICE' } } };
  const additional = createDefaultNfseModelAdditionalOptions() as NfseModelAdditionalOptions; additional.people.personalUse = true;
  additional.service.operationReferences = { source: 'AT_ISSUANCE', value: null };
  additional.service.orderItems = { source: 'FIXED', value: ['ITEM SINTÉTICO A', 'ITEM SINTÉTICO B'] };
  return { id: '00000000-0000-0000-0000-000000000020', name: 'Curso técnico sintético', version: 3, active: true,
    nationalServiceCode: '080201', nbsCode: '122020000', operationIndicatorCode: '030101',
    serviceDescription: 'PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS {{mes_referencia}}', issTreatment: 'TRIBUTAVEL', immunityType: null,
    technicalResponsibilityDocument: '', referenceDocument: '', complementaryInfo: 'COMPLEMENTO SINTÉTICO', orderReference: '',
    peopleOptions: { ...createDefaultNfseModelPeopleOptionsV2(), simpleNationalOption: 'FROM_ESTABLISHMENT',
      simpleNationalAssessment: null, recipientIsDestination: true },
    serviceOptions: { version: 1, countryCode: 'BRA', municipalityCode: '2803401', exportResultCountryCode: null,
      includeIbsCbs: true, governmentPurchase: false, governmentEntityType: null, operationType: null,
      countryLabel: 'Brasil', municipalityLabel: 'Japoatã / SE' }, valuesOptions: values, additionalOptions: additional };
}
