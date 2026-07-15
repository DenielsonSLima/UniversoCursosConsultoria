import type { TechnicalLandingConfig } from '../technicalLanding.types';
import {
  BASE_TECHNICAL_DOCUMENTS,
  HEALTH_STAGE_DOCUMENTS,
  cloneDocuments,
} from '../shared/technicalLanding.defaults';

export const analisesClinicasLandingConfig: TechnicalLandingConfig = {
  templateKey: 'analises-clinicas',
  eyebrow: 'Matrículas abertas · Laboratório e saúde',
  description: 'Formação técnica para rotinas laboratoriais, organização de amostras e apoio qualificado aos processos de análises clínicas.',
  formTitle: 'Inscrição em Análises Clínicas',
  formDescription: 'Após entrar, informe somente sua situação escolar para seguir ao pagamento. Os PDFs serão enviados posteriormente.',
  highlights: [
    'Formação voltada às rotinas técnicas de laboratório.',
    'Conteúdos de qualidade, biossegurança e organização.',
    'Práticas e estágio acompanhados pela coordenação.',
    'Documentação analisada pela secretaria acadêmica.',
  ],
  documents: cloneDocuments(BASE_TECHNICAL_DOCUMENTS, HEALTH_STAGE_DOCUMENTS),
  documentationNotice: 'A regularidade vacinal e outros requisitos de biossegurança serão conferidos antes das atividades práticas e do estágio.',
  accent: 'violet',
};
