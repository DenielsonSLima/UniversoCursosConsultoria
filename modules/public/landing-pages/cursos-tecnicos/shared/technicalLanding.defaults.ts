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
    label: 'Declaração de matrícula no Ensino Médio',
    description: 'Para estudantes que estão cursando a 2ª ou a 3ª série.',
    phase: 'ANTES_ATIVACAO',
    situations: ['CURSANDO_2_ANO', 'CURSANDO_3_ANO'],
  },
  {
    key: 'historico-certificado-ensino-medio',
    label: 'Histórico e certificado do Ensino Médio',
    description: 'Para quem já concluiu o Ensino Médio.',
    phase: 'ANTES_ATIVACAO',
    situations: ['CONCLUIDO'],
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
