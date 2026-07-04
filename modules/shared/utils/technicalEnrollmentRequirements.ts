import { isValidCpf } from './identityValidation';

export interface TechnicalEnrollmentRequirement {
  key: string;
  label: string;
  description: string;
}

export const TECHNICAL_DOCUMENT_TYPE_OPTIONS = [
  {
    value: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    label: 'Carteira Nacional de Identificação (CIN)',
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

const REQUIRED_TECHNICAL_DOCUMENT_TYPES = new Set([
  'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
  'CIN',
  'CNI',
  'CNH',
  'RG',
  'RG ANTIGO',
  'RG (ANTIGO)',
]);

const hasText = (value?: unknown) => String(value || '').trim().length > 0;

const normalizeDocumentType = (value?: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const isAcceptedTechnicalDocumentType = (value?: unknown) => {
  const normalized = normalizeDocumentType(value);
  if (!normalized) return false;
  return Array.from(REQUIRED_TECHNICAL_DOCUMENT_TYPES).some((allowed) =>
    normalized === normalizeDocumentType(allowed) || normalized.includes(normalizeDocumentType(allowed))
  );
};

export const getTechnicalEnrollmentMissingFields = (profile: any): TechnicalEnrollmentRequirement[] => {
  const missing: TechnicalEnrollmentRequirement[] = [];
  const responsibleName = profile?.responsavelNome ?? profile?.responsavel_nome;
  const responsibleCpf = profile?.responsavelCpf ?? profile?.responsavel_cpf;
  const responsiblePhone = profile?.responsavelTelefone ?? profile?.responsavel_telefone;
  const responsibleKinship = profile?.responsavelParentesco ?? profile?.responsavel_parentesco;
  const hasThirdPartyResponsible = [responsibleName, responsibleCpf, responsiblePhone, responsibleKinship].some(hasText);

  if (!hasText(profile?.nomeMae ?? profile?.nome_mae)) {
    missing.push({
      key: 'nomeMae',
      label: 'Nome da mãe',
      description: 'Informe o nome completo da mãe para identificação acadêmica.',
    });
  }

  if (!isAcceptedTechnicalDocumentType(profile?.tipoDocumento ?? profile?.tipo_documento)) {
    missing.push({
      key: 'tipoDocumento',
      label: 'Tipo de documento',
      description: 'Escolha CIN, CNH ou RG como documento de identificação.',
    });
  }

  if (!hasText(profile?.rg)) {
    missing.push({
      key: 'rg',
      label: 'Número do documento',
      description: 'Preencha o número do documento informado.',
    });
  }

  if ((profile?.responsavelFinanceiro ?? profile?.responsavel_financeiro) !== true) {
    missing.push({
      key: 'responsavelFinanceiro',
      label: 'Responsável financeiro',
      description: 'Declare quem assume as cobranças da matrícula técnica.',
    });
  }

  if (hasThirdPartyResponsible) {
    if (!hasText(responsibleName)) {
      missing.push({
        key: 'responsavelNome',
        label: 'Nome do responsável financeiro',
        description: 'Informe o nome completo do responsável financeiro.',
      });
    }

    if (!hasText(responsibleCpf) || !isValidCpf(String(responsibleCpf))) {
      missing.push({
        key: 'responsavelCpf',
        label: 'CPF do responsável financeiro',
        description: 'Informe um CPF válido para o responsável financeiro.',
      });
    }
  }

  return missing;
};

export const formatTechnicalEnrollmentMissingFields = (profile: any) =>
  getTechnicalEnrollmentMissingFields(profile).map((item) => item.label).join(', ');
