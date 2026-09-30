import {
  formatCpf,
  isValidCpf,
  isValidEmail,
  normalizeEmail,
  onlyDigits,
} from '../../../../../shared/utils/identityValidation.ts';

export type PixKeyType = '' | 'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | 'EVP';

export interface ProfessorPoloOption {
  id: string;
  nome: string;
  cidade: string;
  estado?: string | null;
  uf?: string | null;
}

export interface ProfessorFormData {
  poloId: string;
  poloIds: string[];
  foto: string;
  nomeCompleto: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  racaCor: string;
  rg: string;
  orgaoEmissor: string;
  titulacao: string;
  areaFormacao: string;
  instituicaoFormacao: string;
  especialidade: string;
  registroProfissional: string;
  numeroRegistro: string;
  tipoVinculo: string;
  tipoChavePix: PixKeyType;
  chavePix: string;
  banco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  email: string;
  contato1: string;
  contato2: string;
  observacao: string;
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const PRESET_TITULACOES = [
  'GRADUAÇÃO',
  'ESPECIALIZAÇÃO',
  'MESTRADO',
  'DOUTORADO',
  'PÓS-DOUTORADO',
];

export const REGISTROS = [
  'CRM', 'COREN', 'CRO', 'CRN', 'CRP', 'CRF', 'CREA', 'CRC', 'OAB', 'CREFITO', 'Não possui',
];

export const PRESET_VINCULOS = ['CLT', 'PJ', 'AUTÔNOMO', 'VOLUNTÁRIO', 'CONTRATO'];

export const BANCOS = [
  'Banco do Brasil',
  'Caixa Econômica Federal',
  'Bradesco',
  'Itaú',
  'Santander',
  'Nubank',
  'Inter',
  'Sicoob',
  'Sicredi',
  'BTG Pactual',
  'Outro',
];

export const PIX_KEY_OPTIONS: Array<{ value: Exclude<PixKeyType, ''>; label: string }> = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'PHONE', label: 'Telefone celular' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'EVP', label: 'Chave aleatória' },
];

const isDatabaseUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isPixEvp = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const CNPJ_FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_SECOND_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

const calculateCnpjDigit = (value: string, weights: number[]) => {
  const sum = Array.from(value).reduce(
    (total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index],
    0,
  );
  const remainder = sum % 11;
  return String(remainder < 2 ? 0 : 11 - remainder);
};

export const isValidPixCnpj = (value: string) => {
  const normalized = value.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/.test(normalized)) return false;

  const base = normalized.slice(0, 12);
  if (/^([A-Z0-9])\1{11}$/.test(base)) return false;

  const firstDigit = calculateCnpjDigit(base, CNPJ_FIRST_DIGIT_WEIGHTS);
  const secondDigit = calculateCnpjDigit(
    `${base}${firstDigit}`,
    CNPJ_SECOND_DIGIT_WEIGHTS,
  );
  return normalized.slice(12) === `${firstDigit}${secondDigit}`;
};

export const createInitialProfessorFormData = (
  defaultPoloId?: string | null,
): ProfessorFormData => {
  const initialPoloId = defaultPoloId && isDatabaseUuid(defaultPoloId) ? defaultPoloId : '';

  return {
    poloId: initialPoloId,
    poloIds: initialPoloId ? [initialPoloId] : [],
    foto: '',
    nomeCompleto: '',
    cpf: '',
    dataNascimento: '',
    sexo: '',
    racaCor: '',
    rg: '',
    orgaoEmissor: '',
    titulacao: '',
    areaFormacao: '',
    instituicaoFormacao: '',
    especialidade: '',
    registroProfissional: '',
    numeroRegistro: '',
    tipoVinculo: '',
    tipoChavePix: '',
    chavePix: '',
    banco: '',
    agencia: '',
    conta: '',
    tipoConta: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    email: '',
    contato1: '',
    contato2: '',
    observacao: '',
  };
};

export const maskCep = (value: string) => value
  .replace(/\D/g, '')
  .replace(/(\d{5})(\d)/, '$1-$2')
  .replace(/(-\d{3})\d+?$/, '$1');

export const maskPhone = (value: string) => {
  let digits = onlyDigits(value);
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
};

export const maskDate = (value: string) => value
  .replace(/\D/g, '')
  .replace(/(\d{2})(\d)/, '$1/$2')
  .replace(/(\d{2})(\d)/, '$1/$2')
  .replace(/(\/\d{4})\d+?$/, '$1');

const maskCnpjPix = (value: string) => {
  const chars = value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 14);
  if (chars.length > 12) {
    return `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5, 8)}/${chars.slice(8, 12)}-${chars.slice(12)}`;
  }
  if (chars.length > 8) {
    return `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5, 8)}/${chars.slice(8)}`;
  }
  if (chars.length > 5) return `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5)}`;
  if (chars.length > 2) return `${chars.slice(0, 2)}.${chars.slice(2)}`;
  return chars;
};

export const formatPixKeyInput = (type: PixKeyType, value: string) => {
  if (type === 'CPF') return formatCpf(value);
  if (type === 'CNPJ') return maskCnpjPix(value);
  if (type === 'PHONE') return maskPhone(value);
  if (type === 'EMAIL') return normalizeEmail(value);
  if (type === 'EVP') return value.trim().toLowerCase().slice(0, 36);
  return value;
};

export const normalizePixKey = (type: PixKeyType, value: string) => {
  if (!value.trim()) return '';
  if (type === 'CPF') return onlyDigits(value);
  if (type === 'CNPJ') return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (type === 'PHONE') {
    const digits = onlyDigits(value);
    return digits.startsWith('55') && digits.length > 11 ? `+${digits}` : `+55${digits}`;
  }
  if (type === 'EMAIL') return normalizeEmail(value);
  if (type === 'EVP') return value.trim().toLowerCase();
  return value.trim();
};

export const pixKeyPlaceholder = (type: PixKeyType) => {
  if (type === 'CPF') return '000.000.000-00';
  if (type === 'CNPJ') return '00.000.000/0000-00';
  if (type === 'PHONE') return '(00) 00000-0000';
  if (type === 'EMAIL') return 'nome@dominio.com';
  if (type === 'EVP') return '00000000-0000-0000-0000-000000000000';
  return 'Selecione primeiro o tipo da chave';
};

export const validatePixKey = (type: PixKeyType, value: string): string | null => {
  const hasType = Boolean(type);
  const hasValue = Boolean(value.trim());
  if (!hasType && !hasValue) return null;
  if (!hasType) return 'Selecione o tipo da chave Pix.';
  if (!hasValue) return 'Informe a chave Pix ou deixe o tipo sem seleção.';

  const normalized = normalizePixKey(type, value);
  if (type === 'CPF' && !isValidCpf(normalized)) return 'Informe um CPF válido como chave Pix.';
  if (type === 'CNPJ' && !isValidPixCnpj(normalized)) {
    return 'Informe um CNPJ válido como chave Pix.';
  }
  if (type === 'PHONE' && !/^\+55[1-9]\d{9,10}$/.test(normalized)) {
    return 'Informe um telefone brasileiro completo com DDD.';
  }
  if (type === 'EMAIL' && (!isValidEmail(normalized) || normalized.length > 77)) {
    return 'Informe um e-mail válido como chave Pix.';
  }
  if (type === 'EVP' && !isPixEvp(normalized)) return 'Informe uma chave aleatória válida.';
  return null;
};

export const getProfessorStepError = (step: number, data: ProfessorFormData): string | null => {
  if (step === 1) {
    if (data.poloIds.length === 0) return 'Selecione pelo menos um polo para o professor.';
    if (!data.nomeCompleto.trim()) return 'Informe o nome completo do professor.';
    if (!data.cpf.trim()) return 'Informe o CPF do professor.';
    if (!isValidCpf(data.cpf)) return 'Informe um CPF válido para o professor.';
    if (data.dataNascimento && data.dataNascimento.length !== 10) {
      return 'Se preencher a data de nascimento, informe-a no formato DD/MM/AAAA.';
    }
  }
  if (step === 3) return validatePixKey(data.tipoChavePix, data.chavePix);
  if (step === 4) {
    if (data.email && !isValidEmail(data.email)) return 'Se preencher o e-mail, informe um endereço válido.';
    if (data.contato1 && onlyDigits(data.contato1).length < 10) {
      return 'Se preencher o celular, informe o número completo com DDD.';
    }
  }
  return null;
};

export const getProfessorFormError = (data: ProfessorFormData) => {
  for (const step of [1, 2, 3, 4]) {
    const message = getProfessorStepError(step, data);
    if (message) return { step, message };
  }
  return null;
};

export const formatPoloLocation = (polo: ProfessorPoloOption) =>
  `${polo.cidade} / ${polo.estado || polo.uf || 'UF não informada'}`;
