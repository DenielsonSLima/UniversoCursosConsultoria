export type IncomingPayload = {
  action?: string;
  partnerId?: string;
  partnerIds?: string[];
  email?: string | null;
  password?: string | null;
  redirectTo?: string;
  user?: Record<string, unknown>;
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
  polo_id?: string | null;
  polo_ids?: string[] | null;
};

export type PublicApiKeyResolution = {
  apiKey: string | null;
  message: string | null;
};
