import { normalizeEmail, sendRecoveryEmail } from "../auth-users.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import type {
  HandlerContext,
  Partner,
  PublicApiKeyResolution,
} from "../types.ts";

const TERMS_VERSION = Deno.env.get("TERMS_VERSION") || "2026-06-25";

const markStudentNeedsAccess = async (admin: any, partnerId: string) => {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("parceiros")
    .update({
      troca_senha_obrigatoria: true,
      aceitou_termos_uso: true,
      aceitou_termos_uso_em: now,
      termos_uso_versao: TERMS_VERSION,
    })
    .eq("id", partnerId);

  return error?.message || null;
};

export const handleSendStudentInvite = async (
  context: HandlerContext,
  partner: Partner,
  options: {
    email?: string | null;
    redirectTo?: string | null;
    supabaseUrl: string;
    publicApiKey: PublicApiKeyResolution;
  },
) => {
  const { admin, json } = context;
  if (partner.tipo !== "Aluno") {
    return json({
      success: false,
      error: "Só é possível enviar convite para alunos.",
    }, 400);
  }

  const email = normalizeEmail(options.email || partner.email);
  if (!email) {
    return json(
      { success: false, error: "E-mail do aluno não informado." },
      400,
    );
  }

  const redirectResolution = resolveRedirectTarget(options.redirectTo);
  if (!redirectResolution.redirectTo) {
    return json({
      success: false,
      error: redirectResolution.error || "redirectTo inválido.",
    }, redirectResolution.status);
  }
  const finalRedirect = redirectResolution.redirectTo;

  const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      nome: partner.nome,
      origem: "cadastro_gestor",
      partner_id: partner.id,
    },
    redirectTo: finalRedirect,
  });

  if (inviteResult.error) {
    const updateError = await markStudentNeedsAccess(admin, partner.id);
    if (updateError) {
      return json({ success: false, error: updateError }, 500);
    }

    const emailDelivery = options.publicApiKey.apiKey
      ? await sendRecoveryEmail(
        options.supabaseUrl,
        options.publicApiKey.apiKey,
        email,
        finalRedirect,
      )
      : { sent: false, message: options.publicApiKey.message };

    if (emailDelivery.sent) {
      return json({
        success: true,
        action: "recovery",
        userId: null,
        inviteSent: false,
        recoveryEmailSent: true,
        recoveryLink: null,
        message:
          "Usuário já possui acesso. Enviamos o link de recuperação por e-mail.",
      });
    }

    const recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: finalRedirect },
    });

    if (recovery.error) {
      return json({
        success: false,
        error: recovery.error.message || emailDelivery.message ||
          inviteResult.error.message ||
          "Não foi possível enviar o convite de acesso.",
      }, 500);
    }

    return json({
      success: true,
      action: "recovery",
      userId: recovery.data?.user?.id || null,
      inviteSent: false,
      recoveryEmailSent: false,
      recoveryLink: recovery.data?.properties?.action_link || null,
      message: emailDelivery.message
        ? `Falha ao enviar e-mail automático: ${emailDelivery.message} Geramos um link de recuperação para enviar manualmente, se necessário.`
        : "Usuário já possui acesso. Geramos um link de recuperação para primeiro acesso.",
    });
  }

  const updateError = await markStudentNeedsAccess(admin, partner.id);
  if (updateError) {
    return json({ success: false, error: updateError }, 500);
  }

  return json({
    success: true,
    action: "invite",
    userId: inviteResult.data?.user?.id || null,
    inviteSent: true,
    recoveryLink: null,
    message: "Convite de acesso enviado com sucesso.",
  });
};
