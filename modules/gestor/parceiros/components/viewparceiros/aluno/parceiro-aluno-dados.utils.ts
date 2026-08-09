import { formatPhone, onlyDigits } from '../../../../../../lib/documentFormatters';
import { TECHNICAL_DOCUMENT_TYPE_OPTIONS } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import { uppercaseAlunoTextFields } from '../../../utils/aluno-formatters';
import { normalizeCertidaoMatricula } from '../../../utils/certidao-civil';

export const DEFAULT_DOCUMENT_TYPE = 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO';

const normalizeText = (value?: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const maskCpf = (value?: string | null) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
};

export const maskPhone = (value?: string | null) => {
  const rawDigits = onlyDigits(value);
  const localDigits = rawDigits.startsWith('55') && rawDigits.length > 11 ? rawDigits.slice(2) : rawDigits;
  const digits = localDigits.slice(0, 11);

  if (digits.length > 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length > 6) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length > 2) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return digits;
};

export const maskCep = (value?: string | null) => {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
};

export const maskDate = (value?: string | null) => {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
};

export const normalizeDocumentType = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return DEFAULT_DOCUMENT_TYPE;
  if (['CIN', 'CNI'].includes(normalized) || normalized.includes('CARTEIRA NACIONAL')) {
    return DEFAULT_DOCUMENT_TYPE;
  }
  if (normalized.includes('CNH') || normalized.includes('HABILITACAO')) {
    return 'CNH';
  }
  if (normalized === 'RG' || normalized.includes('REGISTRO GERAL') || normalized.includes('RG ANTIGO')) {
    return 'RG (ANTIGO)';
  }

  const option = TECHNICAL_DOCUMENT_TYPE_OPTIONS.find((item) =>
    normalizeText(item.value) === normalized || normalizeText(item.label) === normalized
  );
  return option?.value || String(value || DEFAULT_DOCUMENT_TYPE);
};

export const formatDocumentTypeLabel = (value?: string | null) => {
  const normalizedValue = normalizeDocumentType(value);
  return TECHNICAL_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === normalizedValue)?.label || normalizedValue;
};

export const formatPhoneDisplay = (value?: string | null) => (value ? formatPhone(value) : '');

export const normalizeAlunoFormData = (data: any) => {
  const normalized = uppercaseAlunoTextFields(data || {});
  const telefone = maskPhone(normalized.telefone || normalized.contato1);
  const situacaoEnsinoMedio = normalized.situacaoEnsinoMedio
    || (normalized.escolaridadeAnterior === 'CURSANDO ENSINO MÉDIO' ? 'CURSANDO' : '')
    || (normalized.escolaridadeAnterior === 'ENSINO MÉDIO COMPLETO' ? 'CONCLUIDO' : '');
  return {
    ...normalized,
    cpf: maskCpf(normalized.cpf || normalized.cpf_cnpj),
    cep: maskCep(normalized.cep),
    dataNascimento: maskDate(normalized.dataNascimento),
    racaCor: normalized.racaCor || '',
    rgDataEmissao: maskDate(normalized.rgDataEmissao),
    tituloEleitorZona: String(normalized.tituloEleitorZona || ''),
    tituloEleitorSecao: String(normalized.tituloEleitorSecao || ''),
    tituloEleitorDataEmissao: maskDate(normalized.tituloEleitorDataEmissao),
    tituloEleitorUf: normalized.tituloEleitorUf || '',
    tipoDocumento: normalizeDocumentType(normalized.tipoDocumento),
    certidaoTipo: normalized.certidaoTipo || '',
    certidaoModelo: normalized.certidaoModelo || '',
    certidaoMatricula: normalizeCertidaoMatricula(normalized.certidaoMatricula),
    certidaoTermo: normalized.certidaoTermo || '',
    certidaoLivro: normalized.certidaoLivro || '',
    certidaoFolha: normalized.certidaoFolha || '',
    telefone,
    contato1: telefone || maskPhone(normalized.contato1),
    contato2: maskPhone(normalized.contato2),
    responsavelCpf: maskCpf(normalized.responsavelCpf),
    responsavelTelefone: maskPhone(normalized.responsavelTelefone),
    situacaoEnsinoMedio,
    serieEnsinoMedioAtual: String(normalized.serieEnsinoMedioAtual || ''),
    escolaEnsinoMedio: normalized.escolaEnsinoMedio || normalized.instituicaoOrigem || '',
    anoConclusaoEnsinoMedio: String(normalized.anoConclusaoEnsinoMedio || ''),
    anoPrevisaoConclusaoEnsinoMedio: String(
      normalized.anoPrevisaoConclusaoEnsinoMedio
      ?? normalized.anoPrevistoConclusaoEnsinoMedio
      ?? '',
    ),
  };
};
