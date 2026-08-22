import { isUuid } from "../permissions.ts";
import type { HandlerContext } from "../types.ts";
import { recordResponsavelAccessAudit } from "./responsavel-access-audit.ts";
import {
  loadPreparedResponsavelAccess,
  resolveCanonicalResponsavelIdentity,
  respondResponsavelAccessFailure,
} from "./responsavel-access-context.ts";

const ACTION = "confirm-responsavel-email";

export const handleConfirmResponsavelEmail = async (
  context: HandlerContext,
  responsavelLegalIdValue: unknown,
  emailValidatedByManager: boolean,
) => {
  const responsavelLegalId = String(responsavelLegalIdValue || "").trim();
  if (!isUuid(responsavelLegalId)) {
    return context.json({
      success: false,
      error: "responsavelLegalId válido é obrigatório.",
    }, 400);
  }
  if (!emailValidatedByManager) {
    return context.json({
      success: false,
      error:
        "Confirme que validou a titularidade do e-mail por um canal independente antes de continuar.",
    }, 422);
  }

  const prepared = await loadPreparedResponsavelAccess(
    context,
    responsavelLegalId,
  );
  if ("failure" in prepared) {
    return respondResponsavelAccessFailure(context, prepared);
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

  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  if (!isUuid(actorAuthUserId)) {
    return context.json({
      success: false,
      error: "A identidade do gestor não pôde ser confirmada.",
    }, 401);
  }

  try {
    await recordResponsavelAccessAudit(context, prepared, {
      action: "Autorizou validação de e-mail assistida",
      description:
        "Autorizou a validação administrativa da titularidade do e-mail de acesso do responsável.",
      details: { confirmationMethod: "manager_validated_contact" },
    });
  } catch {
    return context.json({
      success: false,
      error: "Não foi possível registrar a autorização para validar o e-mail.",
    }, 500);
  }

  try {
    const { error } = await context.admin.rpc(
      "portal_validar_email_responsavel_por_gestor",
      {
        p_responsavel_legal_id: responsavelLegalId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return context.json({
        success: false,
        error: "Não foi possível registrar a validação do e-mail.",
      }, error.code === "42501" ? 403 : 500);
    }
  } catch {
    return context.json({
      success: false,
      error: "Não foi possível registrar a validação do e-mail.",
    }, 500);
  }

  return context.json({
    success: true,
    action: ACTION,
    userId: identity.authUser.id,
    emailConfirmed: Boolean(identity.authUser.email_confirmed_at),
    emailValidatedByManager: true,
    message:
      "E-mail validado pelo gestor. Agora você pode gerar uma senha temporária.",
  });
};
