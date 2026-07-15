import type { TechnicalLandingConfig } from '../technicalLanding.types';
import {
  BASE_TECHNICAL_DOCUMENTS,
  HEALTH_STAGE_DOCUMENTS,
  cloneDocuments,
} from '../shared/technicalLanding.defaults';

export const saudeBucalLandingConfig: TechnicalLandingConfig = {
  templateKey: 'saude-bucal',
  eyebrow: 'Matrículas abertas · Saúde bucal',
  description: 'Formação técnica para apoio aos serviços odontológicos, promoção da saúde e organização segura do ambiente clínico.',
  formTitle: 'Inscrição em Técnico em Saúde Bucal',
  formDescription: 'Faça login e informe os dados escolares essenciais. O envio de documentos fica disponível depois do pagamento.',
  highlights: [
    'Formação direcionada ao apoio em serviços odontológicos.',
    'Conteúdos de biossegurança e promoção da saúde.',
    'Práticas e estágio organizados pela coordenação.',
    'Acompanhamento acadêmico pelo portal do aluno.',
  ],
  documents: cloneDocuments(BASE_TECHNICAL_DOCUMENTS, HEALTH_STAGE_DOCUMENTS),
  documentationNotice: 'Documentos de saúde e biossegurança serão verificados antes da participação nas atividades práticas e no estágio.',
  accent: 'cyan',
};
