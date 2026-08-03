import type { TechnicalLandingDocument } from '../technicalLanding.types';

export const BASE_TECHNICAL_DOCUMENTS: TechnicalLandingDocument[] = [
  {
    key: 'identificacao',
    label: 'Documento oficial de identificação',
    description: 'CIN, RG ou CNH, frente e verso, em arquivo legível.',
    phase: 'APOS_PAGAMENTO',
  },
  {
    key: 'cpf',
    label: 'CPF',
    description: 'Pode estar no documento de identificação.',
    phase: 'APOS_PAGAMENTO',
  },
  {
    key: 'residencia',
    label: 'Comprovante de residência',
    description: 'Documento recente com endereço atualizado.',
    phase: 'ANTES_ATIVACAO',
  },
  {
    key: 'certidao-civil',
    label: 'Certidão de nascimento ou casamento',
    phase: 'ANTES_ATIVACAO',
  },
  {
    key: 'declaracao-matricula-ensino-medio',
    label: 'Declaração de escolaridade',
    description: 'Documento escolar atualizado solicitado para regularização da matrícula.',
    phase: 'ANTES_ATIVACAO',
  },
  {
    key: 'historico-certificado-ensino-medio',
    label: 'Histórico e certificado do Ensino Médio',
    description: 'Histórico escolar e, quando houver conclusão, o respectivo certificado.',
    phase: 'ANTES_ATIVACAO',
  },
  {
    key: 'foto-3x4',
    label: 'Foto 3x4 recente',
    description: 'Imagem frontal, nítida e atualizada.',
    phase: 'ANTES_ATIVACAO',
  },
  {
    key: 'titulo-eleitor',
    label: 'Título de eleitor',
    description: 'Solicitado quando o aluno for maior de 18 anos.',
    phase: 'ANTES_ATIVACAO',
  },
  {
    key: 'reservista',
    label: 'Certificado de reservista',
    description: 'Solicitado aos alunos homens, quando aplicável.',
    phase: 'ANTES_ATIVACAO',
  },
];

export const HEALTH_STAGE_DOCUMENTS: TechnicalLandingDocument[] = [
  {
    key: 'carteira-vacinacao',
    label: 'Carteira de vacinação atualizada',
    description: 'A secretaria confirmará as vacinas exigidas antes do estágio supervisionado.',
    phase: 'ANTES_ESTAGIO',
  },
];

export const cloneDocuments = (...groups: TechnicalLandingDocument[][]) =>
  groups.flat().map((document) => ({ ...document }));
