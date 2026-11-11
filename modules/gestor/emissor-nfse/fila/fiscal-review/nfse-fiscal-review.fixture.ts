import type { NfseFiscalReview, NfseFiscalReviewDefinition } from './nfse-fiscal-review.types';

export const fiscalId = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
export const fiscalScope = { contextKey: fiscalId(1), poloId: fiscalId(2), environment: 'HOMOLOGACAO' as const, month: '2026-11' };
export const fiscalReview: NfseFiscalReview = {
  documentId: fiscalId(3), revision: 0, reviewStatus: 'NOT_REVIEWED', basisToken: 'a'.repeat(64), reviewComplete: false, canTransmit: false,
  preparation: { studentName: 'Aluno sintético', classLabel: 'Turma sintética', paymentMonth: '2026-10', amount: '260.00', receiptCount: 1,
    originalModel: { id: fiscalId(4), version: 1, name: 'Modelo anterior', nationalServiceCode: '080101' } },
  issuer: { name: 'Emitente sintético', cnpj: '00000000000000', municipalityCode: '2803401', municipalRegistration: 'IM sintética',
    opSimpNac: '3', regEspTrib: '0', regApTribSN: null, configurationVersion: 2 },
  recipient: { mode: 'STUDENT', studentId: fiscalId(5), name: 'Aluno sintético', document: '00000000000', confirmed: false,
    address: { street: 'Rua sintética', number: '1', complement: null, district: 'Centro', city: 'Cidade sintética', state: 'SE', postalCode: '00000000' } },
  service: { modelId: fiscalId(4), modelVersion: 1, nationalServiceCode: '080101', nbsCode: '122020000', description: 'Descrição original sintética',
    issTreatment: 'TRIBUTAVEL', competenceDate: null, serviceDate: null },
  checks: [{ code: 'SOURCE_REVALIDATION_REQUIRED', status: 'UNKNOWN', message: 'Os recebimentos serão conferidos novamente antes da transmissão.' }],
  savedAt: null, savedBy: null,
};
export const fiscalDefinition: NfseFiscalReviewDefinition = { modelId: fiscalId(6), modelVersion: 2,
  recipient: { mode: 'STUDENT', confirmed: true }, competenceDate: '2026-11-10', serviceDate: '2026-11-09',
  classificationConfirmed: true, receiptsConfirmed: true };
