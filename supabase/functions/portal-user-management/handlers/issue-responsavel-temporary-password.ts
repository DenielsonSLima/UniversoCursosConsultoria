import { isUuid } from "../permissions.ts";
import type { HandlerContext } from "../types.ts";
import { recordResponsavelAccessAudit } from "./responsavel-access-audit.ts";
import {
  loadPreparedResponsavelAccess,
  type PreparedResponsavelAccess,
  resolveCanonicalResponsavelIdentity,
  respondResponsavelAccessFailure,
  type ResponsavelAuthUser,
} from "./responsavel-access-context.ts";
import { generateTemporaryPassword } from "./temporary-password.ts";

const ACTION = "issue-responsavel-temporary-password";
export const RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY =
  "universocc_responsavel_temporary_password_issue_id";
export const RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY =
  "universocc_responsavel_temporary_password_write_nonce";

const emissionRpc = async (
  context: HandlerContext,
  name: string,
  responsavelLegalId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(name, {
      p_responsavel_legal_id: responsavelLegalId,
      p_emissao_id: issueId,
      p_actor_auth_user_id: actorAuthUserId,
    });
    if (error) {
      return {
        value: false,
        failed: true,
        errorCode: String(error.code || ""),
        errorMessage: String(error.message || ""),
      };
    }
    return { value: data === true, failed: false };
  } catch {
    return { value: false, failed: true };
  }
};

const reserveTemporaryPasswordEmission = (
  context: HandlerContext,
  responsavelLegalId: string,
  issueId: string,
  actorAuthUserId: string,
) =>
  emissionRpc(
    context,
    "portal_reservar_emissao_senha_temporaria_responsavel",
    responsavelLegalId,
    issueId,
    actorAuthUserId,
  );

const completeTemporaryPasswordEmission = (
  context: HandlerContext,
  responsavelLegalId: string,
  issueId: string,
  actorAuthUserId: string,
) =>
  emissionRpc(
    context,
    "portal_concluir_emissao_senha_temporaria_responsavel",
    responsavelLegalId,
    issueId,
    actorAuthUserId,
  );

const cancelTemporaryPasswordEmission = (
  context: HandlerContext,
  responsavelLegalId: string,
  issueId: string,
  actorAuthUserId: string,
) =>
  emissionRpc(
    context,
    "portal_cancelar_emissao_senha_temporaria_responsavel",
    responsavelLegalId,
    issueId,
    actorAuthUserId,
  );

const confirmTemporaryPasswordEmissionCleanup = (
  context: HandlerContext,
  responsavelLegalId: string,
  issueId: string,
  actorAuthUserId: string,
) =>
  emissionRpc(
    context,
    "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    responsavelLegalId,
    issueId,
    actorAuthUserId,
  );

const issueIdFromAuthUser = (authUser: ResponsavelAuthUser) =>
  String(
    authUser?.app_metadata
      ?.[RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY] ||
      "",
  ).trim();

const writeNonceFromAuthUser = (authUser: ResponsavelAuthUser) =>
  String(
    authUser?.app_metadata
      ?.[RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY] ||
      "",
  ).trim();

const appMetadataWithIssue = (
  authUser: ResponsavelAuthUser,
  issueId: string,
) => ({
  ...(authUser?.app_metadata && typeof authUser.app_metadata === "object" &&
      !Array.isArray(authUser.app_metadata)
    ? authUser.app_metadata
    : {}),
  [RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY]: issueId,
  [RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY]: issueId,
});

const appMetadataWithoutIssue = (authUser: ResponsavelAuthUser) => ({
  ...(authUser?.app_metadata && typeof authUser.app_metadata === "object" &&
      !Array.isArray(authUser.app_metadata)
    ? authUser.app_metadata
    : {}),
  // GoTrue mescla app_metadata; null remove somente o marcador do Responsável.
  [RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY]: null,
  [RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY]: null,
});

const markIssueInAuth = async (
  context: HandlerContext,
  authUserId: string,
  issueId: string,
) => {
  let authUser: ResponsavelAuthUser;
  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    if (error || !data?.user) return false;
    authUser = data.user;
  } catch {
    return false;
  }

  const currentIssueId = issueIdFromAuthUser(authUser);
  const currentWriteNonce = writeNonceFromAuthUser(authUser);
  if (
    (currentIssueId && currentIssueId !== issueId) ||
    (currentWriteNonce && currentWriteNonce !== issueId)
  ) return false;
  if (currentIssueId !== issueId || currentWriteNonce !== issueId) {
    try {
      await context.admin.auth.admin.updateUserById(authUserId, {
        app_metadata: appMetadataWithIssue(authUser, issueId),
      });
    } catch {
      // Uma resposta perdida pode ocorrer depois do commit; confirme abaixo.
    }
  }

  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    return !error && Boolean(data?.user) &&
      issueIdFromAuthUser(data.user) === issueId &&
      writeNonceFromAuthUser(data.user) === issueId;
  } catch {
    return false;
  }
};

const cleanIssueMarker = async (
  context: HandlerContext,
  responsavelLegalId: string,
  issueId: string,
  authUserId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    if (error || !data?.user) return false;
    const currentIssueId = issueIdFromAuthUser(data.user);
    const currentWriteNonce = writeNonceFromAuthUser(data.user);
    if (
      (currentIssueId && currentIssueId !== issueId) ||
      (currentWriteNonce && currentWriteNonce !== issueId)
    ) return false;
    if (currentIssueId === issueId || currentWriteNonce === issueId) {
      try {
        await context.admin.auth.admin.updateUserById(authUserId, {
          app_metadata: appMetadataWithoutIssue(data.user),
        });
      } catch {
        // A RPC abaixo relê auth.users e falha fechada se a remoção não ocorreu.
      }
    }
  } catch {
    return false;
  }

  const confirmation = await confirmTemporaryPasswordEmissionCleanup(
    context,
    responsavelLegalId,
    issueId,
    actorAuthUserId,
  );
  return !confirmation.failed && confirmation.value;
};

const cancelAndCleanIssue = async (
  context: HandlerContext,
  responsavelLegalId: string,
  issueId: string,
  authUserId: string,
  actorAuthUserId: string,
) => {
  const cancellation = await cancelTemporaryPasswordEmission(
    context,
    responsavelLegalId,
    issueId,
    actorAuthUserId,
  );
  if (cancellation.failed || !cancellation.value) return false;
  return cleanIssueMarker(
    context,
    responsavelLegalId,
    issueId,
    authUserId,
    actorAuthUserId,
  );
};

const reconcilePendingIssue = async (
  context: HandlerContext,
  prepared: PreparedResponsavelAccess,
  authUserId: string,
  actorAuthUserId: string,
) => {
  const pendingIssueId = String(prepared.temporaryPasswordIssueId || "").trim();
  if (!pendingIssueId) return { reconciled: true };
  if (!isUuid(pendingIssueId)) return { reconciled: false };

  const cleanupPending = prepared.temporaryPasswordIssueStartedAt == null &&
    (prepared.temporaryPasswordRevokedIssueIds || []).includes(pendingIssueId);
  try {
    await recordResponsavelAccessAudit(context, prepared, {
      action: cleanupPending
        ? "Autorizou limpeza de emissão de senha temporária"
        : "Autorizou reconciliação de senha temporária",
      description: cleanupPending
        ? "Autorizou a remoção segura do marcador técnico de uma emissão revogada, sem revelar credenciais."
        : "Autorizou a conferência de uma emissão pendente de senha temporária sem revelar credenciais.",
      details: {
        delivery: "manager_assisted",
        reconciliation: cleanupPending ? "marker_cleanup" : "pending_issue",
      },
    });
  } catch {
    return { reconciled: false, auditUnavailable: true };
  }

  if (cleanupPending) {
    return {
      reconciled: await cleanIssueMarker(
        context,
        prepared.responsavelLegalId,
        pendingIssueId,
        authUserId,
        actorAuthUserId,
      ),
    };
  }
  if (prepared.temporaryPasswordIssueStartedAt == null) {
    return { reconciled: false };
  }

  const completion = await completeTemporaryPasswordEmission(
    context,
    prepared.responsavelLegalId,
    pendingIssueId,
    actorAuthUserId,
  );
  if (completion.failed || !completion.value) return { reconciled: false };
  return {
    reconciled: await cleanIssueMarker(
      context,
      prepared.responsavelLegalId,
      pendingIssueId,
      authUserId,
      actorAuthUserId,
    ),
  };
};

const successResponse = (
  context: HandlerContext,
  prepared: PreparedResponsavelAccess,
  authUserId: string,
  temporaryPassword: string,
) =>
  context.json({
    success: true,
    action: ACTION,
    userId: authUserId,
    emailConfirmed: true,
    emailValidatedByManager: prepared.emailValidatedByManager === true,
    temporaryPassword,
    message:
      "Senha temporária gerada. O responsável deverá criar uma nova senha no primeiro login.",
  });

const finishAfterPasswordAttempt = async (
  context: HandlerContext,
  prepared: PreparedResponsavelAccess,
  authUserId: string,
  actorAuthUserId: string,
  issueId: string,
  temporaryPassword: string,
) => {
  const completion = await completeTemporaryPasswordEmission(
    context,
    prepared.responsavelLegalId,
    issueId,
    actorAuthUserId,
  );
  if (completion.failed) {
    return context.json({
      success: false,
      error:
        "Não foi possível confirmar o estado da emissão. Não gere outra senha até revisar esta emissão.",
    }, 500);
  }
  if (!completion.value) {
    return context.json({
      success: false,
      error:
        "A alteração no Auth não pôde ser confirmada e a emissão permanece pendente. Não gere outra senha até revisar esta emissão.",
    }, 500);
  }
  const cleaned = await cleanIssueMarker(
    context,
    prepared.responsavelLegalId,
    issueId,
    authUserId,
    actorAuthUserId,
  );
  if (!cleaned) {
    return context.json({
      success: false,
      error:
        "A senha foi atualizada, mas a limpeza segura da emissão ficou pendente. Não entregue esta senha; tente gerar uma nova depois.",
    }, 500);
  }
  return successResponse(
    context,
    prepared,
    authUserId,
    temporaryPassword,
  );
};

type PasswordUpdateOutcome = "confirmed" | "rejected" | "ambiguous";

const settleUndeliverableResponsavelPassword = async (
  context: HandlerContext,
  prepared: PreparedResponsavelAccess,
  authUserId: string,
  actorAuthUserId: string,
  issueId: string,
  updateOutcome: PasswordUpdateOutcome,
  passwordWasVerified: boolean,
) => {
  // Só uma rejeição explícita sem login válido prova que nenhuma escrita de
  // senha ficou em trânsito; nesse caso a reserva pode ser revogada agora.
  if (updateOutcome === "rejected" && !passwordWasVerified) {
    const cleaned = await cancelAndCleanIssue(
      context,
      prepared.responsavelLegalId,
      issueId,
      authUserId,
      actorAuthUserId,
    );
    return context.json({
      success: false,
      error: cleaned
        ? "O Auth recusou a nova senha. A emissão foi cancelada e pode ser tentada novamente."
        : "O Auth recusou a nova senha e a limpeza ficou pendente. Não gere outra senha até revisar esta emissão.",
    }, 500);
  }

  // Em resposta confirmada ou transporte ambíguo, somente a conclusão no
  // banco decide se a escrita já atravessou o fence. Nunca limpamos antes.
  const completion = await completeTemporaryPasswordEmission(
    context,
    prepared.responsavelLegalId,
    issueId,
    actorAuthUserId,
  );
  if (completion.failed || !completion.value) {
    return context.json({
      success: false,
      error:
        "A senha não pôde ser verificada e o resultado da escrita permanece ambíguo. A reserva e os marcadores foram preservados para reconciliação; não gere outra senha até revisar esta emissão.",
    }, 500);
  }

  const cleaned = await cleanIssueMarker(
    context,
    prepared.responsavelLegalId,
    issueId,
    authUserId,
    actorAuthUserId,
  );
  return context.json({
    success: false,
    error: cleaned
      ? "A alteração da senha foi encerrada com segurança, mas a credencial não foi entregue porque a verificação da sessão falhou. Gere uma nova senha temporária."
      : "A senha não foi entregue e a limpeza segura da emissão ficou pendente. Não gere outra senha até revisar esta emissão.",
  }, 500);
};

export const handleIssueResponsavelTemporaryPassword = async (
  context: HandlerContext,
  responsavelLegalIdValue: unknown,
) => {
  const responsavelLegalId = String(responsavelLegalIdValue || "").trim();
  if (!isUuid(responsavelLegalId)) {
    return context.json({
      success: false,
      error: "responsavelLegalId válido é obrigatório.",
    }, 400);
  }

  const prepared = await loadPreparedResponsavelAccess(
    context,
    responsavelLegalId,
  );
  if ("failure" in prepared) {
    return respondResponsavelAccessFailure(context, prepared);
  }
  if (prepared.temporaryPasswordAllowed !== true) {
    return context.json({
      success: false,
      code: "RESPONSAVEL_SENHA_TEMPORARIA_NAO_PERMITIDA",
      error:
        "Esta identidade também possui outro perfil. Para não alterar a senha dos demais portais, use o reenvio ou a recuperação por e-mail.",
    }, 409);
  }
  const identity = await resolveCanonicalResponsavelIdentity(context, prepared);
  if ("failure" in identity) {
    return respondResponsavelAccessFailure(context, identity);
  }
  if (prepared.firstAccessPending === false) {
    return context.json({
      success: false,
      error:
        "Este responsável já concluiu o primeiro acesso. Use a recuperação de senha por e-mail quando necessário.",
    }, 409);
  }

  const emailWasConfirmed = Boolean(identity.authUser.email_confirmed_at);
  if (!emailWasConfirmed && prepared.emailValidatedByManager !== true) {
    return context.json({
      success: false,
      error: "Valide o e-mail informado antes de gerar uma senha temporária.",
    }, 409);
  }

  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  if (!isUuid(actorAuthUserId)) {
    return context.json({
      success: false,
      error: "A identidade do gestor não pôde ser confirmada.",
    }, 401);
  }
  if (!context.verifyTemporaryPassword) {
    return context.json({
      success: false,
      error:
        "A verificação segura da senha temporária não está configurada no servidor.",
    }, 500);
  }

  const reconciliation = await reconcilePendingIssue(
    context,
    prepared,
    identity.authUser.id,
    actorAuthUserId,
  );
  if (!reconciliation.reconciled) {
    return context.json({
      success: false,
      error: reconciliation.auditUnavailable
        ? "Não foi possível auditar a reconciliação de uma emissão pendente. Não gere outra senha até revisar esta emissão."
        : "Existe uma emissão pendente cuja confirmação segura ainda não foi localizada. Não gere outra senha até revisar esta emissão.",
    }, reconciliation.auditUnavailable ? 500 : 409);
  }

  try {
    await recordResponsavelAccessAudit(context, prepared, {
      action: "Autorizou emissão de senha temporária",
      description:
        "Autorizou a emissão de uma senha temporária para o responsável concluir o primeiro acesso.",
      details: { delivery: "manager_assisted", firstAccessRequired: true },
    });
  } catch {
    return context.json({
      success: false,
      error:
        "Não foi possível registrar a autorização para emitir a senha temporária.",
    }, 500);
  }

  const issueId = crypto.randomUUID();
  const reservation = await reserveTemporaryPasswordEmission(
    context,
    responsavelLegalId,
    issueId,
    actorAuthUserId,
  );
  if (reservation.failed) {
    if (
      reservation.errorMessage?.includes(
        "PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_IDENTIDADE_MULTIPERFIL",
      )
    ) {
      return context.json({
        success: false,
        code: "RESPONSAVEL_SENHA_TEMPORARIA_NAO_PERMITIDA",
        error:
          "Esta identidade também possui outro perfil. Para não alterar a senha dos demais portais, use o reenvio ou a recuperação por e-mail.",
      }, 409);
    }
    return context.json({
      success: false,
      error: "Não foi possível reservar a emissão da senha temporária.",
    }, 500);
  }
  if (!reservation.value) {
    return context.json({
      success: false,
      error:
        "Já existe uma emissão de senha temporária pendente para este responsável. Conclua ou revise a emissão anterior antes de gerar outra.",
    }, 409);
  }

  const marked = await markIssueInAuth(
    context,
    identity.authUser.id,
    issueId,
  );
  if (!marked) {
    const cleaned = await cancelAndCleanIssue(
      context,
      responsavelLegalId,
      issueId,
      identity.authUser.id,
      actorAuthUserId,
    );
    return context.json({
      success: false,
      error: cleaned
        ? "Não foi possível preparar a emissão segura da senha temporária. Gere uma nova senha."
        : "Não foi possível preparar a emissão segura da senha temporária. Não gere outra até revisar esta emissão.",
    }, 500);
  }

  const temporaryPassword = generateTemporaryPassword();
  let passwordUpdateOutcome: PasswordUpdateOutcome = "ambiguous";
  try {
    const { error } = await context.admin.auth.admin.updateUserById(
      identity.authUser.id,
      {
        email_confirm: true,
        password: temporaryPassword,
      },
    );
    passwordUpdateOutcome = error ? "rejected" : "confirmed";
  } catch {
    // A resposta pode se perder depois do commit. A autenticação efêmera
    // abaixo confirma diretamente se esta senha específica ficou vigente.
  }

  let verification = { verified: false, sessionClosed: false };
  try {
    verification = await context.verifyTemporaryPassword(
      identity.email,
      temporaryPassword,
      identity.authUser.id,
    );
  } catch {
    // Falha fechada abaixo. Escrita ambígua preserva o fence até reconciliação.
  }
  if (!verification.verified || !verification.sessionClosed) {
    return settleUndeliverableResponsavelPassword(
      context,
      prepared,
      identity.authUser.id,
      actorAuthUserId,
      issueId,
      passwordUpdateOutcome,
      verification.verified,
    );
  }

  return finishAfterPasswordAttempt(
    context,
    prepared,
    identity.authUser.id,
    actorAuthUserId,
    issueId,
    temporaryPassword,
  );
};
