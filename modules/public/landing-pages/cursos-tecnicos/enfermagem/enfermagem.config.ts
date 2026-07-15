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
};
