export type IncomingPayload = {
  action?: string;
  partnerId?: string;
  partnerIds?: string[];
  email?: string | null;
  password?: string | null;
  redirectTo?: string;
  user?: Record<string, unknown>;
  userId?: string;
  userIds?: string[];
  status?: string;
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
  message?: string;
  recoveryLink?: string | null;
  user?: Record<string, unknown> | null;
  statuses?: PartnerEmailStatus[];
  managementStates?: GestorUserManagementState[];
  emailConfirmed?: boolean;
  error?: string;
};

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
};

export type JsonResponder = (
  payload: FunctionResponse,
  status?: number,
) => Response;

export type HandlerContext = {
  admin: any;
  gestor: any;
  gestorEmail: string;
  json: JsonResponder;
};

export type Partner = {
  id: string;
  tipo: string;
  nome: string;
  email?: string | null;
  auth_user_id?: string | null;
  acesso_status?: string | null;
  acesso_erro?: string | null;
  convite_enviado_em?: string | null;
  acesso_ativado_em?: string | null;
  troca_senha_obrigatoria?: boolean | null;
  matricula_acesso?: string | null;
  auth_login_email?: string | null;
  polo_id?: string | null;
  polo_ids?: string[] | null;
};

export type PublicApiKeyResolution = {
  apiKey: string | null;
  message: string | null;
};
