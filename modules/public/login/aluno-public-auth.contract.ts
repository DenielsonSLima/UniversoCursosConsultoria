import type { RelationshipPreferenceSurface } from '../../shared/constants/relationship-consent';

export type PublicSignupRelationshipSurface = Extract<
  RelationshipPreferenceSurface,
  'public_signup_web' | 'public_signup_app'
>;

export interface PublicAlunoSignupData {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  racaCor: string;
  password: string;
  acceptedTerms: boolean;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  turnstileToken: string;
  redirectPath?: string;
  appFlow?: boolean;
}

export type PublicAlunoProfileData = Omit<
  PublicAlunoSignupData,
  'password' | 'redirectPath' | 'appFlow'
> & {
  relationshipBirthdayPreferenceSurface?: PublicSignupRelationshipSurface;
};

export type LegacyPublicAlunoProfileData = Omit<
  PublicAlunoProfileData,
  | 'cep'
  | 'endereco'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'turnstileToken'
> & Partial<Pick<
  PublicAlunoProfileData,
  | 'cep'
  | 'endereco'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'relationshipBirthdayPreferenceSurface'
>>;

export interface FinalizePortalFirstAccessData {
  role: 'Aluno' | 'Responsavel';
  contextId: string;
  requestId: string;
  acceptedTerms: boolean;
  acceptTermsVersion?: string;
  setPassword?: boolean;
  newPassword?: string;
}

export type FirstAccessRpcResult = {
  contextId: string;
  firstAccess: {
    acceptedTermsAt: string;
    acceptedTermsVersion: string;
    requiresPasswordReset: false;
  };
  replayed: boolean;
};

export const PUBLIC_ALUNO_SEXO_OPTIONS = [
  { value: 'FEMININO', label: 'Feminino' },
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'NÃO-BINÁRIO', label: 'Não binário' },
  { value: 'PREFIRO NÃO INFORMAR', label: 'Prefiro não informar' },
] as const;

export const PUBLIC_ALUNO_RACA_COR_OPTIONS = [
  { value: 'BRANCA', label: 'Branca' },
  { value: 'PRETA', label: 'Preta' },
  { value: 'PARDA', label: 'Parda' },
  { value: 'AMARELA', label: 'Amarela' },
  { value: 'INDÍGENA', label: 'Indígena' },
  { value: 'PREFIRO NÃO INFORMAR', label: 'Prefiro não informar' },
] as const;

export const PUBLIC_ALUNO_ALREADY_REGISTERED_CODE = 'public_aluno_already_registered' as const;
export const PUBLIC_ALUNO_ALREADY_REGISTERED_MESSAGE =
  'Usuário já cadastrado. Entre com o e-mail informado no cadastro ou use Recuperar senha para acessar sua conta.';
export const PUBLIC_ALUNO_CONFIRMATION_RESENT_MESSAGE =
  'Usuário já cadastrado. Enviamos um novo link de confirmação para o e-mail informado. Você também pode Entrar ou usar Recuperar senha.';
export const PUBLIC_ALUNO_EMAIL_CONFIRMATION_REQUIRED_MESSAGE =
  'Confirme o e-mail enviado para ativar sua conta. Verifique também Spam ou Lixo eletrônico.';

export class PublicAlunoAlreadyRegisteredError extends Error {
  readonly code = PUBLIC_ALUNO_ALREADY_REGISTERED_CODE;
  readonly confirmationResent: boolean;

  constructor(confirmationResent = false) {
    super(confirmationResent
      ? PUBLIC_ALUNO_CONFIRMATION_RESENT_MESSAGE
      : PUBLIC_ALUNO_ALREADY_REGISTERED_MESSAGE);
    this.name = 'PublicAlunoAlreadyRegisteredError';
    this.confirmationResent = confirmationResent;
  }
}

export const isPublicAlunoAlreadyRegisteredError = (
  error: unknown,
): error is PublicAlunoAlreadyRegisteredError => (
  error instanceof PublicAlunoAlreadyRegisteredError
  || (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === PUBLIC_ALUNO_ALREADY_REGISTERED_CODE
  )
);
