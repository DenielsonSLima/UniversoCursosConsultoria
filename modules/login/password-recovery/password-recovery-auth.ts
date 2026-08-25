export type RecoveryMode = "request" | "reset";
export type PasswordSetupKind = "recovery" | "invite";
export type PasswordRecoveryAudience = "student" | "institutional";
export type PasswordRecoveryIntent = "recovery" | "invite";
export type AuthReturnFailureKind = "expired" | "internal" | "invalid";

export interface RecoveryAuthorization {
  userId: string;
  accessToken: string;
  kind: PasswordSetupKind;
}

export interface PasswordRecoveryPageProps {
  appFlow?: boolean;
  audience?: PasswordRecoveryAudience;
  intent?: PasswordRecoveryIntent;
}

interface PasswordSetupPresentationInput {
  appFlow: boolean;
  audience: PasswordRecoveryAudience;
  intent: PasswordRecoveryIntent;
  recoverySource: string | null;
  recoveryFlow: string | null;
  initialKind: PasswordSetupKind | null;
  authorizedKind: PasswordSetupKind | null;
}

export const resolvePasswordSetupPresentation = ({
  appFlow,
  audience,
  intent,
  recoverySource,
  recoveryFlow,
  initialKind,
  authorizedKind,
}: PasswordSetupPresentationInput) => {
  const hasInviteEvidence = initialKind === "invite" ||
    authorizedKind === "invite";
  const isResponsavelFlow = recoverySource === "responsavel";
  return {
    isInstitutional: audience === "institutional" ||
      (!isResponsavelFlow && (
      recoverySource === "institucional" ||
      (!appFlow && hasInviteEvidence)
      )),
    isInviteFlow: intent === "invite" ||
      recoveryFlow === "invite" ||
      hasInviteEvidence,
  };
};

interface AuthReturnFailureInput {
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}

const INTERNAL_AUTH_ERROR_CODES = new Set([
  "database_error",
  "server_error",
  "unexpected_failure",
]);

const EXPIRED_AUTH_ERROR_CODES = new Set([
  "flow_state_expired",
  "otp_expired",
]);

export const classifyAuthReturnFailure = ({
  error,
  errorCode,
  errorDescription,
}: AuthReturnFailureInput): AuthReturnFailureKind => {
  const normalizedCode = String(errorCode || "").trim().toLowerCase();
  const normalizedDetails = `${error || ""} ${errorDescription || ""}`
    .toLowerCase();

  if (
    INTERNAL_AUTH_ERROR_CODES.has(normalizedCode) ||
    /database error|error saving new user|internal server|unexpected failure/
      .test(
        normalizedDetails,
      )
  ) {
    return "internal";
  }

  if (
    EXPIRED_AUTH_ERROR_CODES.has(normalizedCode) ||
    /\bexpired\b|\bexpirou\b|\bexpirado\b/.test(normalizedDetails)
  ) {
    return "expired";
  }

  return "invalid";
};

export const getAuthReturnFailureMessage = (
  failureKind: AuthReturnFailureKind,
  options: {
    audience: PasswordRecoveryAudience;
    intent: PasswordRecoveryIntent;
  },
) => {
  const isInstitutionalInvite = options.audience === "institutional" &&
    options.intent === "invite";

  if (failureKind === "internal") {
    return isInstitutionalInvite
      ? "O serviço de autenticação não conseguiu concluir a validação do convite por uma falha interna. Isso não significa que o link expirou. Tente novamente em instantes ou solicite um novo convite ao administrador."
      : "O serviço de autenticação não conseguiu validar este link por uma falha interna. Tente novamente em instantes.";
  }

  if (failureKind === "expired") {
    return isInstitutionalInvite
      ? "O convite de primeiro acesso expirou ou já foi utilizado. Solicite um novo convite ao administrador."
      : "O link de recuperação é inválido ou expirou. Solicite um novo link abaixo.";
  }

  return isInstitutionalInvite
    ? "Não foi possível validar o convite de primeiro acesso. Solicite um novo convite ao administrador."
    : "Não foi possível validar o link de recuperação. Solicite um novo link abaixo.";
};

export const getAuthReturnParam = (name: string) => {
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get(name) || searchParams.get(name);
};

export const getPasswordSetupTypeInUrl = (): PasswordSetupKind | null => {
  const type = getAuthReturnParam("type");
  return type === "recovery" || type === "invite" ? type : null;
};

export const clearRecoveryAuthParams = () => {
  const authKeys = [
    "code",
    "access_token",
    "refresh_token",
    "token_type",
    "expires_in",
    "expires_at",
    "type",
    "error",
    "error_code",
    "error_description",
  ];
  const url = new URL(window.location.href);
  authKeys.forEach((key) => url.searchParams.delete(key));

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  authKeys.forEach((key) => hashParams.delete(key));
  const nextHash = hashParams.toString();

  window.history.replaceState(
    {},
    document.title,
    `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ""}`,
  );
};
