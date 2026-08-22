import { normalizeEmail } from "../auth-users.ts";
import { isUuid } from "../permissions.ts";
import type { HandlerContext } from "../types.ts";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type PreparedResponsavelAccess = {
  responsavelLegalId: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  status: string;
  authUserId: string | null;
  eligible: boolean;
  accessBlockReason: string | null;
  emailValidatedByManager?: boolean;
  temporaryPasswordPending?: boolean;
  temporaryPasswordAllowed?: boolean;
  temporaryPasswordIssuedAt?: string | null;
  passwordUpdatedAt?: string | null;
  temporaryPasswordIssueId?: string | null;
  temporaryPasswordIssueStartedAt?: string | null;
  temporaryPasswordRevokedIssueIds?: string[];
  requiresPasswordChange?: boolean;
  termsAccepted?: boolean;
  termsVersion?: string | null;
  currentTermsVersion?: string | null;
  firstAccessPending?: boolean;
};

export type ResponsavelAuthUser = {
  id?: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

type CanonicalResponsavelAuthUser = ResponsavelAuthUser & {
  id: string;
  email: string;
};

export type ResponsavelAccessFailure = {
  failure: true;
  status: number;
  code: string;
  message: string;
};

const failure = (
  status: number,
  code: string,
  message: string,
): ResponsavelAccessFailure => ({ failure: true, status, code, message });

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const optionalBoolean = (
  source: Record<string, unknown>,
  key: string,
) => typeof source[key] === "boolean" ? source[key] as boolean : undefined;

const optionalString = (
  source: Record<string, unknown>,
  key: string,
) => {
  if (source[key] == null) return null;
  const value = String(source[key]).trim();
  return value || null;
};

export const respondResponsavelAccessFailure = (
  context: HandlerContext,
  accessFailure: ResponsavelAccessFailure,
) =>
  context.json({
    success: false,
    code: accessFailure.code,
    error: accessFailure.message,
  }, accessFailure.status);

/**
 * Revalida ator, módulo/escopo e elegibilidade no banco. O Edge usa somente a
 * identidade canônica retornada pela RPC SECURITY DEFINER; metadata editável do
 * usuário nunca participa da autorização.
 */
export const loadPreparedResponsavelAccess = async (
  context: HandlerContext,
  responsavelLegalId: string,
): Promise<PreparedResponsavelAccess | ResponsavelAccessFailure> => {
  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  if (!isUuid(actorAuthUserId)) {
    return failure(
      401,
      "GESTOR_AUTH_INVALIDO",
      "A identidade do gestor não pôde ser confirmada.",
    );
  }

  let data: unknown;
  let rpcError: { code?: string; message?: string } | null;
  try {
    const result = await context.admin.rpc(
      "responsavel_legal_acesso_preparar",
      {
        p_responsavel_legal_id: responsavelLegalId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    data = result.data;
    rpcError = result.error;
  } catch {
    return failure(
      500,
      "RESPONSAVEL_ACESSO_PREPARACAO_FALHOU",
      "Não foi possível preparar o acesso do responsável.",
    );
  }

  if (rpcError) {
    if (rpcError.code === "42501") {
      return failure(
        403,
        "RESPONSAVEL_ACESSO_NAO_AUTORIZADO",
        "Você não possui autorização para preparar este acesso.",
      );
    }
    if (rpcError.code === "P0002") {
      return failure(
        404,
        "RESPONSAVEL_NAO_ENCONTRADO",
        "Responsável não encontrado.",
      );
    }
    return failure(
      500,
      "RESPONSAVEL_ACESSO_PREPARACAO_FALHOU",
      "Não foi possível preparar o acesso do responsável.",
    );
  }

  const source = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  if (!source) {
    return failure(
      500,
      "RESPONSAVEL_ACESSO_CONTRATO_INVALIDO",
      "O serviço retornou um cadastro de responsável inválido.",
    );
  }

  const revokedIssueIds = Array.isArray(
      source.temporaryPasswordRevokedIssueIds,
    )
    ? source.temporaryPasswordRevokedIssueIds
      .map((value) => String(value || "").trim())
      .filter(isUuid)
    : undefined;
  const prepared: PreparedResponsavelAccess = {
    responsavelLegalId: String(source.responsavelLegalId || "").trim(),
    nome: String(source.nome || "").trim(),
    cpf: onlyDigits(source.cpf) || null,
    email: normalizeEmail(source.email as string | null) || null,
    status: String(source.status || "").trim().toUpperCase(),
    authUserId: String(source.authUserId || "").trim() || null,
    eligible: source.eligible === true,
    accessBlockReason: String(source.accessBlockReason || "").trim() || null,
    emailValidatedByManager: optionalBoolean(
      source,
      "emailValidatedByManager",
    ),
    temporaryPasswordPending: optionalBoolean(
      source,
      "temporaryPasswordPending",
    ),
    temporaryPasswordAllowed: optionalBoolean(
      source,
      "temporaryPasswordAllowed",
    ),
    temporaryPasswordIssuedAt: optionalString(
      source,
      "temporaryPasswordIssuedAt",
    ),
    passwordUpdatedAt: optionalString(source, "passwordUpdatedAt"),
    temporaryPasswordIssueId: optionalString(
      source,
      "temporaryPasswordIssueId",
    ),
    temporaryPasswordIssueStartedAt: optionalString(
      source,
      "temporaryPasswordIssueStartedAt",
    ),
    temporaryPasswordRevokedIssueIds: revokedIssueIds,
    requiresPasswordChange: optionalBoolean(source, "requiresPasswordChange"),
    termsAccepted: optionalBoolean(source, "termsAccepted"),
    termsVersion: optionalString(source, "termsVersion"),
    currentTermsVersion: optionalString(source, "currentTermsVersion"),
    firstAccessPending: optionalBoolean(source, "firstAccessPending"),
  };

  if (
    prepared.responsavelLegalId.toLowerCase() !==
      responsavelLegalId.toLowerCase() ||
    !prepared.nome
  ) {
    return failure(
      500,
      "RESPONSAVEL_ACESSO_CONTRATO_INVALIDO",
      "O serviço retornou um cadastro de responsável inválido.",
    );
  }

  return prepared;
};

export const resolveCanonicalResponsavelIdentity = async (
  context: HandlerContext,
  prepared: PreparedResponsavelAccess,
): Promise<
  | { authUser: CanonicalResponsavelAuthUser; email: string }
  | ResponsavelAccessFailure
> => {
  if (!prepared.eligible || !prepared.cpf || !prepared.email) {
    return failure(
      409,
      "RESPONSAVEL_ACESSO_INELEGIVEL",
      "Complete e verifique CPF, e-mail, identidade e vínculo do responsável antes de continuar.",
    );
  }
  if (!/^\d{11}$/.test(prepared.cpf)) {
    return failure(
      409,
      "RESPONSAVEL_CPF_INVALIDO",
      "O CPF verificado do responsável está inconsistente e requer revisão.",
    );
  }
  if (!EMAIL_PATTERN.test(prepared.email)) {
    return failure(
      409,
      "RESPONSAVEL_EMAIL_INVALIDO",
      "O e-mail verificado do responsável está inconsistente e requer revisão.",
    );
  }
  if (!prepared.authUserId || !isUuid(prepared.authUserId)) {
    return failure(
      409,
      "RESPONSAVEL_AUTH_AUSENTE",
      "Crie o acesso do responsável antes de continuar.",
    );
  }

  let authUser: ResponsavelAuthUser;
  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      prepared.authUserId,
    );
    if (error || !data?.user) {
      return failure(
        409,
        "RESPONSAVEL_AUTH_INCONSISTENTE",
        "O vínculo de autenticação do responsável está inconsistente e requer revisão.",
      );
    }
    authUser = data.user;
  } catch {
    return failure(
      500,
      "RESPONSAVEL_AUTH_CONSULTA_FALHOU",
      "Não foi possível validar a identidade de acesso do responsável.",
    );
  }

  if (
    String(authUser.id || "").trim() !== prepared.authUserId ||
    normalizeEmail(authUser.email) !== prepared.email
  ) {
    return failure(
      409,
      "RESPONSAVEL_AUTH_EMAIL_DIVERGENTE",
      "O e-mail do acesso não corresponde ao e-mail verificado do responsável.",
    );
  }

  return {
    authUser: authUser as CanonicalResponsavelAuthUser,
    email: prepared.email,
  };
};
