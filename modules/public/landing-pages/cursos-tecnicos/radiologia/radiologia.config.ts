import type { TechnicalLandingConfig } from '../technicalLanding.types';
import {
  BASE_TECHNICAL_DOCUMENTS,
  HEALTH_STAGE_DOCUMENTS,
  cloneDocuments,
} from '../shared/technicalLanding.defaults';

export const radiologiaLandingConfig: TechnicalLandingConfig = {
  templateKey: 'radiologia',
  eyebrow: 'Matrículas abertas · Diagnóstico por imagem',
  description: 'Formação técnica orientada à operação responsável, proteção radiológica e qualidade no atendimento ao paciente.',
  formTitle: 'Inscrição em Técnico em Radiologia',
  formDescription: 'Use sua conta de aluno e preencha os dados escolares básicos. Os comprovantes serão enviados após o pagamento.',
  highlights: [
    'Base técnica para atuação em serviços de diagnóstico por imagem.',
    'Conteúdos de segurança e proteção radiológica.',
    'Atividades práticas organizadas pela coordenação.',
    'Histórico documental acompanhado pela secretaria.',
  ],
  documents: cloneDocuments(BASE_TECHNICAL_DOCUMENTS, HEALTH_STAGE_DOCUMENTS),
  documentationNotice: 'Requisitos específicos das práticas e do estágio serão informados pela coordenação antes do início de cada etapa.',
  accent: 'cyan',
};
