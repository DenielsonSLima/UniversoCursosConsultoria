import type { TechnicalLandingConfig } from '../technicalLanding.types';
import {
  BASE_TECHNICAL_DOCUMENTS,
  HEALTH_STAGE_DOCUMENTS,
  cloneDocuments,
} from '../shared/technicalLanding.defaults';

export const enfermagemLandingConfig: TechnicalLandingConfig = {
  templateKey: 'enfermagem',
  eyebrow: 'Matrículas abertas · Área da saúde',
  description: 'Formação técnica com base científica, prática profissional e preparação para os diferentes níveis de atenção à saúde.',
  formTitle: 'Inscrição em Técnico em Enfermagem',
  formDescription: 'Entre com sua conta e informe apenas sua situação no Ensino Médio. Os documentos serão enviados depois do pagamento.',
  highlights: [
    'Aulas teóricas e práticas conforme a organização da turma.',
    'Estágio supervisionado acompanhado pela coordenação.',
    'Documentação acadêmica analisada pela secretaria.',
    'Acompanhamento pelo portal do aluno.',
  ],
  documents: cloneDocuments(BASE_TECHNICAL_DOCUMENTS, HEALTH_STAGE_DOCUMENTS),
  documentationNotice: 'A carteira de vacinação não bloqueia o pagamento, mas deverá ser regularizada antes do estágio supervisionado.',
  accent: 'emerald',
  marketingCampaign: {
    promise: 'Transforme cuidado em profissão.',
    heroImageUrl: '/images/landing/enfermagem-campanha-2026.webp',
    durationLabel: '24 meses',
    enrollmentFee: 200,
    enrollmentBenefit: 'Inclui duas fardas',
    regularMonthlyValue: 279.9,
    punctualMonthlyValue: 259.9,
    installmentsPerCycle: 12,
    cycles: 2,
    reEnrollmentLabel: 'Rematrícula entre os ciclos',
    eligibility: 'Para quem concluiu o Ensino Médio ou está cursando, no mínimo, o 2º ano.',
  },
};
