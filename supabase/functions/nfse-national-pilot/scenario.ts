import type { NationalDpsInput } from '../_shared/nfse-national/dps.types.ts';
import type { PreflightMaterial } from '../nfse-national-preflight/types.ts';

export interface PilotRecipient { partnerId: string; name: string; document: string }

/** Fixed, isolated technical scenario. It does not classify an actual service or receipt. */
export function syntheticPilotScenario(material: PreflightMaterial, now = new Date(), recipient?: PilotRecipient) {
  if (material.environment !== 'HOMOLOGACAO' || !['1','3'].includes(material.issuer.opSimpNac)
    || material.issuer.regEspTrib !== '0') throw new Error('PILOT_REVIEW_INCOMPATIBLE');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (recipient && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipient.partnerId)
    || !/^([0-9]{11}|[0-9]{14})$/.test(recipient.document) || !recipient.name.trim() || recipient.name.length > 150)) {
    throw new Error('PILOT_RECIPIENT_UNAVAILABLE');
  }
  const recipientName = recipient?.name || 'TOMADOR SINTETICO - TESTE SEM VALOR FISCAL';
  const recipientDocument = recipient?.document || material.issuer.cnpj;
  const serviceDescription = 'TESTE TECNICO DE INTEGRACAO NFS-E - SEM VALOR FISCAL - SEM RECEBIMENTOS REAIS';
  const fiscalInput: NationalDpsInput = {
    environment: 'HOMOLOGACAO', purpose: 'REGULAR',
    // The ledger overwrites timestamp, series and number with a durable reservation.
    issuedAt: `${date}T12:00:00-03:00`, applicationVersion: 'UniversoPilot1', series: '49999', number: '1',
    competence: date, issuerMunicipalityCode: material.issuer.municipalityCode,
    issuer: { taxId: { type: 'CNPJ', value: material.issuer.cnpj },
      ...(material.issuer.municipalRegistration ? { municipalRegistration: material.issuer.municipalRegistration } : {}),
      simpleNationalOption: material.issuer.opSimpNac as '1' | '3', specialTaxRegime: '0',
      ...(material.issuer.regApTribSN ? { simpleNationalAssessment: material.issuer.regApTribSN as '1' | '2' | '3' } : {}) },
    recipient: { taxId: { type: recipientDocument.length === 11 ? 'CPF' : 'CNPJ', value: recipientDocument }, name: recipientName },
    service: { municipalityCode: material.issuer.municipalityCode, nationalTaxCode: '080201',
      nbs: '122020000', description: serviceDescription },
    values: { serviceAmount: '1.00', issTaxation: '1', issRetention: '1',
      totalTaxes: { mode: 'AMOUNTS', federal: '0.00', state: '0.00', municipal: '0.00' } },
    review: { recipientConfirmed: true, competenceConfirmed: true, classificationConfirmed: true,
      ibscbs: 'SYNTHETIC_PILOT_OMISSION', federalRetentions: 'NONE_CONFIRMED',
      deductionsAndDiscounts: 'NONE_CONFIRMED' },
  };
  return { fiscalInput, preview: { ...(recipient ? { technicalTest: true as const, recipientSource: 'PARTNER' as const, recipientPartnerId: recipient.partnerId } : { synthetic: true as const }), issuerName: 'Matriz Universo Cursos e Consultoria',
    issuerDocument: material.issuer.cnpj, recipientName, recipientDocument,
    serviceDescription, nationalServiceCode: '080201', competence: date, serviceDate: date,
    serviceAmount: '1.00', opSimpNac: material.issuer.opSimpNac, issTreatment: 'TRIBUTAVEL' } };
}
