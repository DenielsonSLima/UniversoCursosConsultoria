import type { TechnicalLandingConfig } from '../technicalLanding.types';
import { BASE_TECHNICAL_DOCUMENTS, cloneDocuments } from '../shared/technicalLanding.defaults';

export const defaultTechnicalLandingConfig: TechnicalLandingConfig = {
  templateKey: 'default',
  eyebrow: 'Matrículas técnicas abertas',
  description: 'Formação profissional organizada para desenvolver conhecimentos, competências práticas e preparação para o mercado de trabalho.',
  formTitle: 'Comece sua inscrição técnica',
  formDescription: 'Entre com sua conta e informe a situação do Ensino Médio. Os documentos completos serão enviados depois pelo portal.',
  highlights: [
    'Turma, turno e polo confirmados antes do pagamento.',
    'Cadastro escolar adaptado a estudantes e concluintes.',
    'Documentação enviada posteriormente pelo portal.',
    'Acompanhamento acadêmico e financeiro em um só lugar.',
  ],
  documents: cloneDocuments(BASE_TECHNICAL_DOCUMENTS),
  documentationNotice: 'A secretaria poderá complementar o checklist conforme as exigências específicas do curso e da turma.',
  accent: 'blue',
};
