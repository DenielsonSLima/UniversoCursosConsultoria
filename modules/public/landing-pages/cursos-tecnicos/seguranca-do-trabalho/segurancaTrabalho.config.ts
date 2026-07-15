import type { TechnicalLandingConfig } from '../technicalLanding.types';
import { BASE_TECHNICAL_DOCUMENTS, cloneDocuments } from '../shared/technicalLanding.defaults';

export const segurancaTrabalhoLandingConfig: TechnicalLandingConfig = {
  templateKey: 'seguranca-do-trabalho',
  eyebrow: 'Matrículas abertas · Segurança e prevenção',
  description: 'Formação para apoiar ambientes de trabalho mais seguros, prevenção de riscos e promoção da saúde ocupacional.',
  formTitle: 'Inscrição em Segurança do Trabalho',
  formDescription: 'Informe sua situação no Ensino Médio para continuar ao pagamento. A documentação completa será enviada depois pelo portal.',
  highlights: [
    'Formação voltada à prevenção de riscos ocupacionais.',
    'Conteúdos técnicos aplicados ao cotidiano das organizações.',
    'Acompanhamento acadêmico da turma pelo portal.',
    'Checklist documental separado do pagamento.',
  ],
  documents: cloneDocuments(BASE_TECHNICAL_DOCUMENTS),
  documentationNotice: 'A secretaria poderá solicitar documentos complementares previstos no plano e nas atividades práticas da turma.',
  accent: 'blue',
};
