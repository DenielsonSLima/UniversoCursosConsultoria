import type { HandlerContext, Partner } from "../types.ts";
import { isUuid } from "../permissions.ts";
import { recordStudentAccessAudit } from "./student-access-audit.ts";
import { normalizeEmail } from "../auth-users.ts";
import { hasCreatedStudentPassword } from "./student-first-access-state.ts";
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
  let validated = false;
  try {
    const result = await admin.rpc(
      "portal_validar_email_aluno_por_gestor",
      {
        p_partner_id: partner.id,
        p_actor_auth_user_id: actorAuthUserId,
        p_expected_auth_user_id: identity.authUser.id,
        p_expected_email: identity.email,
      },
    );
    validationError = result.error;
    validated = result.data === true;
  } catch {
    return json({
      success: false,
      error: "Não foi possível registrar a validação do e-mail.",
    }, 500);
  }
  if (validationError || !validated) {
    const status = validationError?.code === "42501" ? 403
      : ["40001", "55P03", "23514", "55000"].includes(validationError?.code)
      ? 409
      : 500;
    return json({
      success: false,
      error: validationError?.message ||
        "Não foi possível registrar a validação do e-mail.",
    }, status);
  }

  let currentAuthUser: any;
  let currentPartner: Partner;
  try {
    const authResult = await admin.auth.admin.getUserById(identity.authUser.id);
    const partnerResult = await admin.from("parceiros")
      .select(
        "id, email, auth_login_email, auth_user_id, acesso_status, troca_senha_obrigatoria, senha_atualizada_em, senha_temporaria_pendente, senha_temporaria_emitida_em, senha_temporaria_emissao_id, senha_temporaria_emissao_iniciada_em, senha_temporaria_emissao_senha_alterada_em",
      )
      .eq("id", partner.id)
      .eq("auth_user_id", identity.authUser.id)
      .maybeSingle();
    if (authResult.error || partnerResult.error || !partnerResult.data) {
      throw new Error("Estado indisponível.");
    }
    currentAuthUser = authResult.data?.user;
    currentPartner = partnerResult.data;
  } catch {
    return json({
      success: false,
      error:
        "A confirmação foi processada, mas não foi possível conferir o estado atual. Atualize os dados e tente novamente.",
    }, 500);
  }
  if (
    currentAuthUser?.id !== identity.authUser.id ||
    normalizeEmail(currentAuthUser?.email) !== identity.email ||
    normalizeEmail(currentPartner.email) !== identity.email ||
    normalizeEmail(currentPartner.auth_login_email || currentPartner.email) !==
      identity.email || !currentAuthUser.email_confirmed_at
  ) {
    return json({
      success: false,
      error:
        "A identidade de acesso mudou durante a confirmação. Atualize os dados e tente novamente.",
    }, 409);
  }

  return json({
    success: true,
    action: "confirm-partner-email",
    userId: identity.authUser.id,
    emailConfirmed: true,
    emailValidatedByManager: true,
    studentAccessPending: currentPartner.acesso_status !== "ativo" ||
      currentPartner.troca_senha_obrigatoria !== false,
    message: hasCreatedStudentPassword(currentPartner)
      ? "E-mail confirmado. A senha já criada pelo aluno foi preservada."
      : "E-mail confirmado. O aluno deverá criar sua senha para concluir o primeiro acesso.",
  });
};
