import { isValidCpf, onlyDigits } from './identityValidation.ts';

export interface TechnicalEnrollmentRequirement {
  key: string;
  label: string;
  description: string;
}

export interface TechnicalEnrollmentProfile {
  nome?: string | null;
  nomeCompleto?: string | null;
  cpf?: string | null;
  cpf_cnpj?: string | null;
  nomeMae?: string | null;
  nome_mae?: string | null;
  nomePai?: string | null;
  nome_pai?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  situacaoEnsinoMedio?: string | null;
  situacao_ensino_medio?: string | null;
  serieEnsinoMedioAtual?: number | string | null;
  serie_ensino_medio_atual?: number | string | null;
  escolaEnsinoMedio?: string | null;
  escola_ensino_medio?: string | null;
  anoConclusaoEnsinoMedio?: number | string | null;
  ano_conclusao_ensino_medio?: number | string | null;
  anoPrevisaoConclusaoEnsinoMedio?: number | string | null;
  anoPrevistoConclusaoEnsinoMedio?: number | string | null;
  ano_previsao_conclusao_ensino_medio?: number | string | null;
  ano_previsto_conclusao_ensino_medio?: number | string | null;
}

export const TECHNICAL_DOCUMENT_TYPE_OPTIONS = [
  {
    value: 'CARTEIRA DE IDENTIDADE NACIONAL',
    label: 'CIN - Carteira de Identidade Nacional',
  },
  {
    value: 'CNH',
    label: 'CNH - Carteira Nacional de Habilitação',
  },
  {
    value: 'RG (ANTIGO)',
    label: 'RG - Registro Geral',
  },
] as const;

export const CIN_DOCUMENT_TYPE = TECHNICAL_DOCUMENT_TYPE_OPTIONS[0].value;
export const CNH_DOCUMENT_TYPE = TECHNICAL_DOCUMENT_TYPE_OPTIONS[1].value;
export const LEGACY_RG_DOCUMENT_TYPE = TECHNICAL_DOCUMENT_TYPE_OPTIONS[2].value;
export const AMBIGUOUS_LEGACY_ID_DOCUMENT_TYPE = 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO';

const hasText = (value?: unknown) => String(value || '').trim().length > 0;

const normalizeDocumentTypeSearch = (value?: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const normalizeTechnicalDocumentType = (value?: unknown): string => {
  const original = String(value || '').trim();
  const normalized = normalizeDocumentTypeSearch(original);
  if (!normalized) return '';
  if (normalized === normalizeDocumentTypeSearch(AMBIGUOUS_LEGACY_ID_DOCUMENT_TYPE)) {
    return AMBIGUOUS_LEGACY_ID_DOCUMENT_TYPE;
  }
  if (
    normalized === 'CIN'
    || normalized === 'CNI'
    || normalized.includes('CARTEIRA DE IDENTIDADE NACIONAL')
    || normalized.includes('CARTEIRA NACIONAL DE IDENTIDADE')
  ) return CIN_DOCUMENT_TYPE;
  if (normalized.includes('CNH') || normalized.includes('CARTEIRA NACIONAL DE HABILITACAO')) {
    return CNH_DOCUMENT_TYPE;
  }
  if (
    normalized === 'RG'
    || normalized === 'RG ANTIGO'
    || normalized === 'IDENTIDADE'
    || normalized === 'CARTEIRA DE IDENTIDADE'
    || normalized.includes('REGISTRO GERAL')
  ) return LEGACY_RG_DOCUMENT_TYPE;
  return original;
};

export const isCinDocumentType = (value?: unknown) =>
  normalizeTechnicalDocumentType(value) === CIN_DOCUMENT_TYPE;

export const isCnhDocumentType = (value?: unknown) =>
  normalizeTechnicalDocumentType(value) === CNH_DOCUMENT_TYPE;

export const isLegacyRgDocumentType = (value?: unknown) =>
  normalizeTechnicalDocumentType(value) === LEGACY_RG_DOCUMENT_TYPE;

export const isAmbiguousLegacyIdDocumentType = (value?: unknown) =>
  normalizeTechnicalDocumentType(value) === AMBIGUOUS_LEGACY_ID_DOCUMENT_TYPE;

export const formatTechnicalDocumentTypeLabel = (value?: unknown) => {
  const normalized = normalizeTechnicalDocumentType(value);
  if (normalized === AMBIGUOUS_LEGACY_ID_DOCUMENT_TYPE) {
    return 'Identificação legada — revisar CIN ou RG antigo';
  }
  return TECHNICAL_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === normalized)?.label
    || normalized;
};

export const isAcceptedTechnicalDocumentType = (value?: unknown) => {
  const normalized = normalizeTechnicalDocumentType(value);
  return TECHNICAL_DOCUMENT_TYPE_OPTIONS.some((option) => option.value === normalized)
    || [AMBIGUOUS_LEGACY_ID_DOCUMENT_TYPE, 'PASSAPORTE', 'CARTEIRA PROFISSIONAL'].includes(normalized);
};

export const getTechnicalEnrollmentMissingFields = (
  profile: TechnicalEnrollmentProfile | null | undefined,
): TechnicalEnrollmentRequirement[] => {
  const missing: TechnicalEnrollmentRequirement[] = [];
  const cpf = String(profile?.cpf ?? profile?.cpf_cnpj ?? '');

  if (!hasText(profile?.nomeCompleto ?? profile?.nome)) {
    missing.push({
      key: 'nomeCompleto',
      label: 'Nome completo',
      description: 'Informe o nome completo do aluno.',
    });
  }

  if (!isValidCpf(cpf)) {
    missing.push({
      key: 'cpf',
      label: 'CPF válido',
      description: 'Informe um CPF válido com 11 dígitos.',
    });
  }

  if (!hasText(profile?.nomeMae ?? profile?.nome_mae)) {
    missing.push({
      key: 'nomeMae',
      label: 'Nome da mãe',
      description: 'Informe a filiação materna do aluno.',
    });
  }

  if (!hasText(profile?.endereco)) {
    missing.push({
      key: 'endereco',
      label: 'Endereço',
      description: 'Informe o logradouro do aluno.',
    });
  }

  if (onlyDigits(String(profile?.cep || '')).length !== 8) {
    missing.push({
      key: 'cep',
      label: 'CEP válido',
      description: 'Informe um CEP válido com 8 dígitos.',
    });
  }

  if (!hasText(profile?.bairro)) {
    missing.push({
      key: 'bairro',
      label: 'Bairro',
      description: 'Informe o bairro do aluno.',
    });
  }

  if (!hasText(profile?.cidade)) {
    missing.push({
      key: 'cidade',
      label: 'Cidade',
      description: 'Informe a cidade do aluno.',
    });
  }

  if (!/^[A-Z]{2}$/.test(String(profile?.uf || '').trim().toUpperCase())) {
    missing.push({
      key: 'uf',
      label: 'UF válida',
      description: 'Informe a UF do endereço com 2 letras.',
    });
  }

  return missing;
};

export const formatTechnicalEnrollmentMissingFields = (
  profile: TechnicalEnrollmentProfile | null | undefined,
) =>
  getTechnicalEnrollmentMissingFields(profile).map((item) => item.label).join(', ');
