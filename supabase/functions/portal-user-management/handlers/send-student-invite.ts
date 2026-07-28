import {
  findAuthUserByEmail,
  normalizeEmail,
  sendRecoveryEmail,
} from "../auth-users.ts";
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

  const contactEmail = normalizeEmail(options.email || partner.email);
  const authEmail = normalizeEmail(
    partner.auth_login_email || options.email || partner.email,
  );
  if (!authEmail) {
    return json(
      {
        success: false,
        error: "Identidade de acesso do aluno não configurada.",
      },
      500,
    );
  }
  const canDeliverByEmail = Boolean(
    contactEmail &&
      contactEmail === authEmail &&
      !authEmail.endsWith("@acesso.universocc.invalid"),
  );

  const redirectResolution = resolveRedirectTarget(options.redirectTo);
  if (!redirectResolution.redirectTo) {
    return json({
      success: false,
      error: redirectResolution.error || "redirectTo inválido.",
    }, redirectResolution.status);
  }
  const finalRedirect = redirectResolution.redirectTo;

  let authUser = await findAuthUserByEmail(admin, authEmail);

  if (!authUser && canDeliverByEmail) {
    const inviteResult = await admin.auth.admin.inviteUserByEmail(authEmail, {
      data: {
        nome: partner.nome,
        origem: "cadastro_gestor",
        partner_id: partner.id,
        matricula_acesso: partner.matricula_acesso || null,
      },
      redirectTo: finalRedirect,
    });

    if (!inviteResult.error) {
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
    }

    authUser = await findAuthUserByEmail(admin, authEmail);
    if (!authUser) {
      return json({
        success: false,
        error: inviteResult.error.message ||
          "Não foi possível criar o acesso do aluno.",
      }, 500);
    }
  }

  if (!authUser) {
    const createdUser = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: {
        nome: partner.nome,
        origem: "cadastro_gestor_matricula",
        tipo: "Aluno",
        partner_id: partner.id,
        matricula_acesso: partner.matricula_acesso || null,
      },
    });
    if (createdUser.error || !createdUser.data?.user) {
      return json({
        success: false,
        error: createdUser.error?.message ||
          "Não foi possível criar o acesso por matrícula.",
      }, 500);
    }
    authUser = createdUser.data.user;
  }

  const updateError = await markStudentNeedsAccess(admin, partner.id);
  if (updateError) {
    return json({ success: false, error: updateError }, 500);
  }

  if (canDeliverByEmail) {
    const emailDelivery = options.publicApiKey.apiKey
      ? await sendRecoveryEmail(
        options.supabaseUrl,
        options.publicApiKey.apiKey,
        authEmail,
        finalRedirect,
      )
      : { sent: false, message: options.publicApiKey.message };

    if (emailDelivery.sent) {
      return json({
        success: true,
        action: "recovery",
        userId: authUser.id || null,
        inviteSent: false,
        recoveryEmailSent: true,
        recoveryLink: null,
        message:
          "Usuário já possui acesso. Enviamos o link de recuperação por e-mail.",
      });
    }
  }

  const recovery = await admin.auth.admin.generateLink({
    type: "recovery",
    email: authEmail,
    options: { redirectTo: finalRedirect },
  });
  if (recovery.error) {
    return json({
      success: false,
      error: recovery.error.message ||
        "Não foi possível gerar o link de primeiro acesso.",
    }, 500);
  }

  return json({
    success: true,
    action: "recovery",
    userId: authUser.id || recovery.data?.user?.id || null,
    inviteSent: false,
    recoveryEmailSent: false,
    recoveryLink: recovery.data?.properties?.action_link || null,
    message: canDeliverByEmail
      ? "Geramos um link seguro de recuperação para envio manual."
      : "Aluno sem e-mail: envie o link seguro por um canal previamente verificado, como o WhatsApp cadastrado.",
  });
};
