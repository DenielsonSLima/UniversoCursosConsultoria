import type { HandlerContext, Partner } from "../types.ts";
import { isUuid } from "../permissions.ts";
import { recordStudentAccessAudit } from "./student-access-audit.ts";
import {
  getCurrentTermsVersion,
  hasCompletedStudentFirstAccess,
} from "./student-first-access-state.ts";
import { resolveCanonicalStudentIdentity } from "./student-access-identity.ts";
import { generateTemporaryPassword } from "./temporary-password.ts";
const TEMPORARY_PASSWORD_ISSUE_METADATA_KEY =
  "universocc_temporary_password_issue_id";
export const TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY =
  "universocc_temporary_password_write_nonce";

/** Mantém a política do primeiro acesso sem guardar a senha em lugar algum. */
export const generateStudentTemporaryPassword = generateTemporaryPassword;

const reserveTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_reservar_emissao_senha_temporaria",
      {
        p_partner_id: partnerId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return {
        reserved: false,
        failed: true,
        errorCode: String(error.code || ""),
        errorMessage: String(error.message || ""),
      };
    }
    return { reserved: data === true, failed: false };
  } catch {
    return { reserved: false, failed: true };
  }
};

const completeTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_concluir_emissao_senha_temporaria",
      {
        p_partner_id: partnerId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return {
        error: error.message ||
          "Não foi possível concluir o registro da senha temporária.",
      };
    }
    if (data !== true) return { completed: false };
    return { completed: true };
  } catch {
    return {
      error: "Não foi possível concluir o registro da senha temporária.",
    };
  }
};

const cancelTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_cancelar_emissao_senha_temporaria",
      {
        p_partner_id: partnerId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return {
        error: error.message ||
          "Não foi possível liberar a emissão não concluída.",
      };
    }
    return { cancelled: data === true };
  } catch {
    return { error: "Não foi possível liberar a emissão não concluída." };
  }
};

const confirmTemporaryPasswordEmissionCleanup = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_confirmar_limpeza_emissao_senha_temporaria",
      {
        p_partner_id: partnerId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return {
        error: error.message ||
          "Não foi possível concluir a limpeza da emissão.",
      };
    }
    return { cleaned: data === true };
  } catch {
    return { error: "Não foi possível concluir a limpeza da emissão." };
  }
};

const appMetadataForTemporaryPasswordIssue = (
  authUser: any,
  issueId: string,
) => ({
  ...(authUser?.app_metadata && typeof authUser.app_metadata === "object" &&
      !Array.isArray(authUser.app_metadata)
    ? authUser.app_metadata
    : {}),
  [TEMPORARY_PASSWORD_ISSUE_METADATA_KEY]: issueId,
  [TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY]: issueId,
});

const temporaryPasswordIssueIdFromAuthUser = (authUser: any) =>
  String(
    authUser?.app_metadata?.[TEMPORARY_PASSWORD_ISSUE_METADATA_KEY] || "",
  ).trim();

const temporaryPasswordWriteNonceFromAuthUser = (authUser: any) =>
  String(
    authUser?.app_metadata?.[TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY] || "",
  ).trim();

const appMetadataWithoutTemporaryPasswordIssue = (authUser: any) => {
  const appMetadata = authUser?.app_metadata &&
      typeof authUser.app_metadata === "object" &&
      !Array.isArray(authUser.app_metadata)
    ? authUser.app_metadata
    : {};
  // GoTrue mescla app_metadata. Para remover de fato a chave, ela precisa ser
  // enviada com null; omiti-la preservaria o UUID da emissão anterior.
  return {
    ...appMetadata,
    [TEMPORARY_PASSWORD_ISSUE_METADATA_KEY]: null,
    [TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY]: null,
  };
};

const markTemporaryPasswordIssueInAuth = async (
  context: HandlerContext,
  authUserId: string,
  issueId: string,
) => {
  let authUser: any;
  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    if (error || !data?.user) {
      return {
        error:
          "Não foi possível preparar a identidade para a emissão da senha temporária.",
      };
    }
    authUser = data.user;
  } catch {
    return {
      error:
        "Não foi possível preparar a identidade para a emissão da senha temporária.",
    };
  }

  const currentIssueId = temporaryPasswordIssueIdFromAuthUser(authUser);
  const currentWriteNonce = temporaryPasswordWriteNonceFromAuthUser(authUser);
  if (
    (currentIssueId && currentIssueId !== issueId) ||
    (currentWriteNonce && currentWriteNonce !== issueId)
  ) {
    return {
      error:
        "Existe um marcador técnico de outra emissão que precisa ser revisado antes de gerar uma senha.",
    };
  }

  let markerUpdateFailed = false;
  if (currentIssueId !== issueId || currentWriteNonce !== issueId) {
    try {
      // UserUpdate grava a senha antes de app_metadata. Por isso marcador e
      // nonce são stageados e confirmados antes da chamada password-only.
      const { error: updateError } = await context.admin.auth.admin
        .updateUserById(authUserId, {
          app_metadata: appMetadataForTemporaryPasswordIssue(authUser, issueId),
        });
      markerUpdateFailed = Boolean(updateError);
    } catch {
      markerUpdateFailed = true;
      // A resposta pode se perder depois do commit. A leitura abaixo é a
      // fonte canônica para decidir se a etapa ficou pronta.
    }
  }

  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    if (
      !error && data?.user &&
      temporaryPasswordIssueIdFromAuthUser(data.user) === issueId &&
      temporaryPasswordWriteNonceFromAuthUser(data.user) === issueId
    ) {
      return { marked: true };
    }
  } catch {
    // Falha fechada abaixo: não trocamos senha sem confirmar o marcador.
  }

  return {
    error: markerUpdateFailed
      ? "O Auth não confirmou o marcador seguro da emissão da senha temporária."
      : "Não foi possível confirmar o marcador seguro da emissão da senha temporária.",
  };
};

const cleanTemporaryPasswordIssueMarker = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  authUserId: string,
  actorAuthUserId: string,
) => {
  let cleanupUpdateFailed = false;
  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    if (error || !data?.user) {
      return {
        error:
          "Não foi possível localizar a identidade para concluir a limpeza da emissão.",
      };
    }

    const currentIssueId = temporaryPasswordIssueIdFromAuthUser(data.user);
    const currentWriteNonce = temporaryPasswordWriteNonceFromAuthUser(
      data.user,
    );
    if (
      (currentIssueId && currentIssueId !== issueId) ||
      (currentWriteNonce && currentWriteNonce !== issueId)
    ) {
      return {
        error:
          "A identidade contém marcadores de outra emissão e requer revisão.",
      };
    }
    if (currentIssueId === issueId || currentWriteNonce === issueId) {
      try {
        const { error: updateError } = await context.admin.auth.admin
          .updateUserById(authUserId, {
            app_metadata: appMetadataWithoutTemporaryPasswordIssue(data.user),
          });
        cleanupUpdateFailed = Boolean(updateError);
      } catch {
        cleanupUpdateFailed = true;
        // A confirmação canônica abaixo consulta auth.users novamente e só
        // libera a reserva se o marcador realmente não estiver mais presente.
      }
    }
  } catch {
    return {
      error:
        "Não foi possível localizar a identidade para concluir a limpeza da emissão.",
    };
  }

  const confirmation = await confirmTemporaryPasswordEmissionCleanup(
    context,
    partnerId,
    issueId,
    actorAuthUserId,
  );
  if ("cleaned" in confirmation && confirmation.cleaned) return confirmation;
  if (cleanupUpdateFailed && !("error" in confirmation)) {
    return {
      error: "Não foi possível remover o marcador técnico da emissão.",
    };
  }
  return confirmation;
};

const revokeAndCleanTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  authUserId: string,
  actorAuthUserId: string,
) => {
  const cancellation = await cancelTemporaryPasswordEmission(
    context,
    partnerId,
    issueId,
    actorAuthUserId,
  );
  if (!("cancelled" in cancellation) || !cancellation.cancelled) {
    return { cleaned: false, cancellationFailed: true };
  }

  return cleanTemporaryPasswordIssueMarker(
    context,
    partnerId,
    issueId,
    authUserId,
    actorAuthUserId,
  );
};

const reconcilePendingTemporaryPasswordEmission = async (
  context: HandlerContext,
  partner: Partner,
  authUserId: string,
  actorAuthUserId: string,
) => {
  const pendingIssueId = String(
    partner.senha_temporaria_emissao_id || "",
  ).trim();
  if (!pendingIssueId) return { reconciled: true };
  if (!isUuid(pendingIssueId)) return { reconciled: false };

  const revokedIssueIds = Array.isArray(
      partner.senha_temporaria_emissoes_revogadas,
    )
    ? partner.senha_temporaria_emissoes_revogadas
    : [];
  const cleanupPending = partner.senha_temporaria_emissao_iniciada_em == null &&
    revokedIssueIds.includes(pendingIssueId);

  try {
    await recordStudentAccessAudit(context, partner, {
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
    const cleanup = await cleanTemporaryPasswordIssueMarker(
      context,
      partner.id,
      pendingIssueId,
      authUserId,
      actorAuthUserId,
    );
    return {
      reconciled: "cleaned" in cleanup && cleanup.cleaned === true,
    };
  }

  if (partner.senha_temporaria_emissao_iniciada_em == null) {
    return { reconciled: false };
  }

  const completion = await completeTemporaryPasswordEmission(
    context,
    partner.id,
    pendingIssueId,
    actorAuthUserId,
  );
  if ("error" in completion) {
    return { reconciled: false };
  }
  if (!completion.completed) {
    // Depois que a chamada de senha foi enviada, uma resposta ausente não
    // prova que o Auth não a aplicará mais tarde. Mantemos a reserva e o
    // marcador ativos em vez de liberar uma nova emissão que poderia ser
    // sobrescrita por esse retry tardio.
    return { reconciled: false };
  }

  const cleanup = await cleanTemporaryPasswordIssueMarker(
    context,
    partner.id,
    pendingIssueId,
    authUserId,
    actorAuthUserId,
  );
  return {
    reconciled: "cleaned" in cleanup && cleanup.cleaned === true,
  };
};

const temporaryPasswordSuccessResponse = (
  context: HandlerContext,
  partner: Partner,
  userId: string,
  temporaryPassword: string,
) =>
  context.json({
    success: true,
    action: "issue-student-temporary-password",
    userId,
    emailConfirmed: true,
    emailValidatedByManager: Boolean(partner.email_validado_gestor_em),
    temporaryPassword,
    message:
      "Senha temporária gerada. O aluno deverá criar uma nova senha no primeiro login.",
  });

type PasswordUpdateOutcome = "confirmed" | "rejected" | "ambiguous";

const settleUndeliverableStudentPassword = async (
  context: HandlerContext,
  partner: Partner,
  authUserId: string,
  actorAuthUserId: string,
  issueId: string,
  updateOutcome: PasswordUpdateOutcome,
  passwordWasVerified: boolean,
) => {
  // Uma resposta explícita de erro, sem autenticação válida, confirma que a
  // escrita não foi aceita. Só nesse caso é seguro revogar imediatamente.
  if (updateOutcome === "rejected" && !passwordWasVerified) {
    const cancellation = await revokeAndCleanTemporaryPasswordEmission(
      context,
      partner.id,
      issueId,
      authUserId,
      actorAuthUserId,
    );
    return context.json({
      success: false,
      error: "cleaned" in cancellation && cancellation.cleaned
        ? "O Auth recusou a nova senha. A emissão foi cancelada e pode ser tentada novamente."
        : "O Auth recusou a nova senha e a limpeza ficou pendente. Não gere outra senha até revisar esta emissão.",
    }, 500);
  }

  // Resposta confirmada ou transporte ambíguo podem representar uma senha já
  // persistida. A RPC observa o fence no banco; nunca limpamos antes dela.
  const completion = await completeTemporaryPasswordEmission(
    context,
    partner.id,
    issueId,
    actorAuthUserId,
  );
  if (!("completed" in completion) || !completion.completed) {
    return context.json({
      success: false,
      error:
        "A senha não pôde ser verificada e o resultado da escrita permanece ambíguo. A reserva e os marcadores foram preservados para reconciliação; não gere outra senha até revisar esta emissão.",
    }, 500);
  }

  const cleanup = await cleanTemporaryPasswordIssueMarker(
    context,
    partner.id,
    issueId,
    authUserId,
    actorAuthUserId,
  );
  return context.json({
    success: false,
    error: "cleaned" in cleanup && cleanup.cleaned
      ? "A alteração da senha foi encerrada com segurança, mas a credencial não foi entregue porque a verificação da sessão falhou. Gere uma nova senha temporária."
      : "A senha não foi entregue e a limpeza segura da emissão ficou pendente. Não gere outra senha até revisar esta emissão.",
  }, 500);
};

export const handleIssueStudentTemporaryPassword = async (
  context: HandlerContext,
  partner: Partner,
) => {
  const { admin, json } = context;
  const identity = await resolveCanonicalStudentIdentity(context, partner);
  if ("error" in identity) {
    return json({ success: false, error: identity.error }, identity.status);
  }

  const terms = await getCurrentTermsVersion(context);
  if ("error" in terms) {
    return json({ success: false, error: terms.error }, 500);
  }
  if (hasCompletedStudentFirstAccess(partner, terms.version)) {
    return json({
      success: false,
      error:
        "Este aluno já concluiu o primeiro acesso. Use a recuperação de senha por e-mail quando necessário.",
    }, 409);
  }

  const emailWasConfirmed = Boolean(identity.authUser.email_confirmed_at);
  if (!emailWasConfirmed && !partner.email_validado_gestor_em) {
    return json({
      success: false,
      error: "Valide o e-mail informado antes de gerar uma senha temporária.",
    }, 409);
  }

  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  if (!isUuid(actorAuthUserId)) {
    return json({
      success: false,
      error: "A identidade do gestor não pôde ser confirmada.",
    }, 401);
  }
  if (!context.verifyTemporaryPassword) {
    return json({
      success: false,
      error:
        "A verificação segura da senha temporária não está configurada no servidor.",
    }, 500);
  }

  const reconciliation = await reconcilePendingTemporaryPasswordEmission(
    context,
    partner,
    identity.authUser.id,
    actorAuthUserId,
  );
  if (!reconciliation.reconciled) {
    return json({
      success: false,
      error: reconciliation.auditUnavailable
        ? "Não foi possível auditar a reconciliação de uma emissão pendente. Não gere outra senha até revisar esta emissão."
        : "Existe uma emissão pendente cuja confirmação segura ainda não foi localizada. Não gere outra senha até revisar esta emissão.",
    }, reconciliation.auditUnavailable ? 500 : 409);
  }

  try {
    await recordStudentAccessAudit(context, partner, {
      action: "Autorizou emissão de senha temporária",
      description:
        "Autorizou a emissão de uma senha temporária para o aluno concluir o primeiro acesso.",
      details: { delivery: "manager_assisted", firstAccessRequired: true },
    });
  } catch {
    return json({
      success: false,
      error:
        "Não foi possível registrar a autorização para emitir a senha temporária.",
    }, 500);
  }

  const issueId = crypto.randomUUID();
  const reservation = await reserveTemporaryPasswordEmission(
    context,
    partner.id,
    issueId,
    actorAuthUserId,
  );
  if (reservation.failed) {
    if (
      reservation.errorMessage?.includes(
        "PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_IDENTIDADE_MULTIPERFIL",
      )
    ) {
      return json({
        success: false,
        code: "ALUNO_SENHA_TEMPORARIA_NAO_PERMITIDA",
        error:
          "Esta identidade também possui outro perfil. Para não alterar a senha dos demais portais, use o reenvio ou a recuperação por e-mail.",
      }, 409);
    }
    return json({
      success: false,
      error: "Não foi possível reservar a emissão da senha temporária.",
    }, 500);
  }
  if (!reservation.reserved) {
    return json({
      success: false,
      error:
        "Já existe uma emissão de senha temporária pendente para este aluno. Conclua ou revise a emissão anterior antes de gerar outra.",
    }, 409);
  }

  const marking = await markTemporaryPasswordIssueInAuth(
    context,
    identity.authUser.id,
    issueId,
  );
  if (!("marked" in marking) || !marking.marked) {
    const cancellation = await revokeAndCleanTemporaryPasswordEmission(
      context,
      partner.id,
      issueId,
      identity.authUser.id,
      actorAuthUserId,
    );
    return json({
      success: false,
      error: "cleaned" in cancellation && cancellation.cleaned
        ? marking.error ||
          "Não foi possível preparar a emissão segura da senha temporária. Gere uma nova senha."
        : "Não foi possível preparar a emissão segura da senha temporária. Não gere outra até revisar esta emissão.",
    }, 500);
  }

  const temporaryPassword = generateStudentTemporaryPassword();
  let passwordUpdateOutcome: PasswordUpdateOutcome = "ambiguous";
  try {
    const { error } = await admin.auth.admin.updateUserById(
      identity.authUser.id,
      {
        email_confirm: true,
        password: temporaryPassword,
      },
    );
    passwordUpdateOutcome = error ? "rejected" : "confirmed";
  } catch {
    // A resposta pode se perder depois do commit. A autenticação efêmera
    // abaixo é a prova canônica de que esta senha específica ficou vigente.
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
    return settleUndeliverableStudentPassword(
      context,
      partner,
      identity.authUser.id,
      actorAuthUserId,
      issueId,
      passwordUpdateOutcome,
      verification.verified,
    );
  }

  const completion = await completeTemporaryPasswordEmission(
    context,
    partner.id,
    issueId,
    actorAuthUserId,
  );
  if (!("completed" in completion) || !completion.completed) {
    // Não retornamos um segredo sem o estado canônico persistido. A trava do
    // banco permanece ativa até uma revisão segura da emissão pendente.
    return json({
      success: false,
      error:
        "A senha foi atualizada, mas não foi possível concluir o registro seguro. Não entregue esta senha; revise a emissão pendente antes de gerar outra.",
    }, 500);
  }

  const cleanup = await cleanTemporaryPasswordIssueMarker(
    context,
    partner.id,
    issueId,
    identity.authUser.id,
    actorAuthUserId,
  );
  if (!("cleaned" in cleanup) || !cleanup.cleaned) {
    return json({
      success: false,
      error:
        "A senha foi atualizada, mas a limpeza segura da emissão ficou pendente. Não entregue esta senha; tente gerar uma nova depois.",
    }, 500);
  }

  return temporaryPasswordSuccessResponse(
    context,
    partner,
    identity.authUser.id,
    temporaryPassword,
  );
};
