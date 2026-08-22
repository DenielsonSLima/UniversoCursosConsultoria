import type { HandlerContext, Partner } from "../types.ts";
import { isUuid } from "../permissions.ts";
import { recordStudentAccessAudit } from "./student-access-audit.ts";
import {
  getCurrentTermsVersion,
  hasCompletedStudentFirstAccess,
} from "./student-first-access-state.ts";
import { resolveCanonicalStudentIdentity } from "./student-access-identity.ts";

export const handleConfirmPartnerEmail = async (
  context: HandlerContext,
  partner: Partner,
  emailValidatedByManager: boolean,
) => {
  const { admin, json } = context;
  if (!emailValidatedByManager) {
    return json(
      {
        success: false,
        error:
          "Confirme que validou a titularidade do e-mail por um canal independente antes de continuar.",
      },
      422,
    );
  }

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

  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  if (!isUuid(actorAuthUserId)) {
    return json({
      success: false,
      error: "A identidade do gestor não pôde ser confirmada.",
    }, 401);
  }

  try {
    await recordStudentAccessAudit(context, partner, {
      action: "Autorizou validação de e-mail assistida",
      description:
        "Autorizou a validação administrativa da titularidade do e-mail de acesso do aluno.",
      details: { confirmationMethod: "manager_validated_contact" },
    });
  } catch {
    return json({
      success: false,
      error: "Não foi possível registrar a autorização para validar o e-mail.",
    }, 500);
  }

  let validationError: any;
  try {
    ({ error: validationError } = await admin.rpc(
      "portal_validar_email_aluno_por_gestor",
      {
        p_partner_id: partner.id,
        p_actor_auth_user_id: actorAuthUserId,
      },
    ));
  } catch {
    return json({
      success: false,
      error: "Não foi possível registrar a validação do e-mail.",
    }, 500);
  }
  if (validationError) {
    return json({
      success: false,
      error: validationError.message ||
        "Não foi possível registrar a validação do e-mail.",
    }, 500);
  }

  return json({
    success: true,
    action: "confirm-partner-email",
    userId: identity.authUser.id,
    emailConfirmed: Boolean(
      identity.authUser.email_confirmed_at || identity.authUser.confirmed_at,
    ),
    emailValidatedByManager: true,
    message:
      "E-mail validado pelo gestor. Agora você pode gerar uma senha temporária.",
  });
};
