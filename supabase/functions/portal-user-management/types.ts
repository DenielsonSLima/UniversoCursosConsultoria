export type IncomingPayload = {
  action?: string;
  partnerId?: string;
  partnerIds?: string[];
  email?: string | null;
  redirectTo?: string;
  user?: Record<string, unknown>;
  userId?: string;
  userIds?: string[];
  status?: string;
  emailValidatedByManager?: boolean;
  responsavelLegalId?: string;
  responsavelLegalIds?: string[];
  requestId?: string;
};

export type GestorUserManagementState = {
  userId: string;
  canDelete: boolean;
  canChangeStatus: boolean;
  hasActivity: boolean;
  reason: string | null;
};

export type FunctionResponse = {
  success: boolean;
  action?: string;
  userId?: string | null;
  partnerDeleted?: boolean;
  partnerDeactivated?: boolean;
  authUserDeleted?: boolean;
  inviteSent?: boolean;
  recoveryEmailSent?: boolean;
  requestFinalized?: boolean;
  message?: string;
  recoveryLink?: string | null;
  user?: Record<string, unknown> | null;
  statuses?: Array<PartnerEmailStatus | ResponsavelAccessStatus>;
  managementStates?: GestorUserManagementState[];
  emailConfirmed?: boolean;
  emailValidatedByManager?: boolean;
  temporaryPassword?: string;
  profileLinked?: boolean;
  profileLinkState?: InstitutionalProfileLinkState;
  responsavelLegalId?: string | null;
  code?: string;
  error?: string;
};

export type InstitutionalProfileLinkState =
  | "linked"
  | "already_linked"
  | "no_matching_gestor"
  | "not_eligible"
  | "requires_global_configuration_access";

export type PartnerEmailStatusValue =
  | "confirmed"
  | "pending"
  | "no_auth_user"
  | "no_email";

export type PartnerEmailStatus = {
  partnerId: string;
  status: PartnerEmailStatusValue;
  authUserExists: boolean;
  emailConfirmed: boolean;
  emailValidatedByManager: boolean;
};

export type ResponsavelAccessStatusValue =
  | "confirmed"
  | "pending"
  | "no_auth_user"
  | "no_email";

export type ResponsavelAccessStatus = {
  responsavelLegalId: string;
  status: ResponsavelAccessStatusValue;
  authUserExists: boolean;
  emailConfirmed: boolean;
  emailValidatedByManager?: boolean;
  temporaryPasswordPending?: boolean;
  temporaryPasswordAllowed?: boolean;
  requiresPasswordChange?: boolean;
  termsAccepted?: boolean;
  currentTermsVersion?: string;
  firstAccessPending?: boolean;
};

export type JsonResponder = (
  payload: FunctionResponse,
  status?: number,
) => Response;

export type TemporaryPasswordVerificationResult = {
  verified: boolean;
  sessionClosed: boolean;
};

export type TemporaryPasswordVerifier = (
  email: string,
  password: string,
  authUserId: string,
) => Promise<TemporaryPasswordVerificationResult>;

export type HandlerContext = {
  admin: any;
  gestor: any;
  gestorEmail: string;
  json: JsonResponder;
  verifyTemporaryPassword?: TemporaryPasswordVerifier;
};

export type Partner = {
  id: string;
  tipo: string;
  nome: string;
  status?: string | null;
  email?: string | null;
  cpf_cnpj?: string | null;
  auth_user_id?: string | null;
  acesso_status?: string | null;
  acesso_erro?: string | null;
  convite_enviado_em?: string | null;
  acesso_ativado_em?: string | null;
  troca_senha_obrigatoria?: boolean | null;
  aceitou_termos_uso?: boolean | null;
  termos_uso_versao?: string | null;
  email_validado_gestor_em?: string | null;
  senha_temporaria_pendente?: boolean | null;
  senha_temporaria_emitida_em?: string | null;
  senha_atualizada_em?: string | null;
  senha_temporaria_emissao_id?: string | null;
  senha_temporaria_emissao_iniciada_em?: string | null;
  senha_temporaria_emissoes_revogadas?: string[] | null;
  matricula_acesso?: string | null;
  auth_login_email?: string | null;
  polo_id?: string | null;
  polo_ids?: string[] | null;
};

export type PublicApiKeyResolution = {
  apiKey: string | null;
  message: string | null;
};
