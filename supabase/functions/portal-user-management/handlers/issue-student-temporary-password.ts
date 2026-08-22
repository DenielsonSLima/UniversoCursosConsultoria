import type { HandlerContext, Partner } from "../types.ts";
import { isUuid } from "../permissions.ts";
import { recordStudentAccessAudit } from "./student-access-audit.ts";
import {
  getCurrentTermsVersion,
  hasCompletedStudentFirstAccess,
} from "./student-first-access-state.ts";
import { resolveCanonicalStudentIdentity } from "./student-access-identity.ts";
import { generateTemporaryPassword } from "./temporary-password.ts";
import { createTemporaryPasswordEmissionCoordinator } from "./temporary-password-emission.ts";

const TEMPORARY_PASSWORD_ISSUE_METADATA_KEY =
  "universocc_temporary_password_issue_id";
export const TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY =
  "universocc_temporary_password_write_nonce";

/** Mantém a política do primeiro acesso sem guardar a senha em lugar algum. */
export const generateStudentTemporaryPassword = generateTemporaryPassword;

const studentTemporaryPasswordEmission =
  createTemporaryPasswordEmissionCoordinator({
    targetParameter: "p_partner_id",
    reserveRpc: "portal_reservar_emissao_senha_temporaria",
    completeRpc: "portal_concluir_emissao_senha_temporaria",
    cancelRpc: "portal_cancelar_emissao_senha_temporaria",
    confirmCleanupRpc: "portal_confirmar_limpeza_emissao_senha_temporaria",
    issueMetadataKey: TEMPORARY_PASSWORD_ISSUE_METADATA_KEY,
    writeNonceMetadataKey: TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY,
  });

const reserveTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  const result = await studentTemporaryPasswordEmission.reserve(
    context,
    partnerId,
    issueId,
    actorAuthUserId,
  );
  return {
    reserved: result.value,
    failed: result.failed,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  };
};

const completeTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  const result = await studentTemporaryPasswordEmission.complete(
    context,
    partnerId,
    issueId,
    actorAuthUserId,
  );
  if (result.failed) {
    return {
      error: result.errorMessage ||
        "Não foi possível concluir o registro da senha temporária.",
    };
  }
  return { completed: result.value };
};

const markTemporaryPasswordIssueInAuth =
  studentTemporaryPasswordEmission.markIssueInAuth;
const cleanTemporaryPasswordIssueMarker =
  studentTemporaryPasswordEmission.cleanIssueMarker;
const revokeAndCleanTemporaryPasswordEmission =
  studentTemporaryPasswordEmission.cancelAndCleanIssue;

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
