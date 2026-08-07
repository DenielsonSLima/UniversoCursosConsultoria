import {
  findAuthUserByEmail,
  normalizeEmail,
  sendRecoveryEmail,
} from "../auth-users.ts";
import { findAuthIdentityConflict } from "../auth-identity-ownership.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import {
  accessErrorMessage,
  accessErrorSummary,
  updateStudentAccess,
} from "../student-access.ts";
import type {
  HandlerContext,
  Partner,
  PublicApiKeyResolution,
} from "../types.ts";

const authOwnershipError = (partner: Partner, authUser: any) => {
  if (!authUser?.id) return "Usuário de autenticação inválido.";
  if (partner.auth_user_id && partner.auth_user_id !== authUser.id) {
    return "Este aluno já está vinculado a outra identidade de acesso.";
  }

  const metadataPartnerId = String(
    authUser.user_metadata?.partner_id || "",
  ).trim();
  if (metadataPartnerId && metadataPartnerId !== partner.id) {
    return "Este e-mail já está vinculado ao acesso de outro cadastro.";
  }
  return null;
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
  const accessWasActive = partner.acesso_status === "ativo" &&
    partner.troca_senha_obrigatoria === false;
  const failAccess = async (
    error: unknown,
    status = 500,
    authUserId?: string | null,
  ) => {
    const message = accessErrorMessage(
      error,
      "Não foi possível preparar o acesso do aluno.",
    );
    await updateStudentAccess(admin, partner.id, {
      ...(authUserId ? { auth_user_id: authUserId } : {}),
      ...(authEmail ? { auth_login_email: authEmail } : {}),
      ...(!accessWasActive ? { acesso_status: "erro" as const } : {}),
      acesso_erro: accessErrorSummary(message),
    });
    return json({ success: false, error: message }, status);
  };

  if (!authEmail) {
    return failAccess("Identidade de acesso do aluno não configurada.");
  }
  const canDeliverByEmail = Boolean(
    contactEmail &&
      contactEmail === authEmail &&
      !authEmail.endsWith("@acesso.universocc.invalid"),
  );
  const isSyntheticAuthEmail = authEmail.endsWith(
    "@acesso.universocc.invalid",
  );

  const redirectResolution = resolveRedirectTarget(options.redirectTo);
  if (!redirectResolution.redirectTo) {
    return failAccess(
      redirectResolution.error || "redirectTo inválido.",
      redirectResolution.status,
    );
  }
  const finalRedirect = redirectResolution.redirectTo;

  if (!accessWasActive) {
    const processingError = await updateStudentAccess(admin, partner.id, {
      acesso_status: "processando",
      acesso_erro: null,
    });
    if (processingError) {
      return json({ success: false, error: processingError }, 500);
    }
  }

  let authUser: any;
  if (partner.auth_user_id) {
    let existingIdentity: any;
    try {
      existingIdentity = await admin.auth.admin.getUserById(
        partner.auth_user_id,
      );
    } catch (error) {
      return failAccess(error, 500, partner.auth_user_id);
    }
    if (existingIdentity.error || !existingIdentity.data?.user) {
      return failAccess(
        "O vínculo de autenticação deste aluno está inconsistente e requer revisão.",
        409,
      );
    }
    authUser = existingIdentity.data.user;
    if (normalizeEmail(authUser.email) !== authEmail) {
      return failAccess(
        "O e-mail de acesso não corresponde à identidade já vinculada ao aluno.",
        409,
        authUser.id,
      );
    }
  } else {
    try {
      authUser = await findAuthUserByEmail(admin, authEmail);
    } catch (error) {
      return failAccess(error);
    }
  }

  if (accessWasActive && !authUser) {
    return failAccess(
      "O acesso estava ativo, mas a identidade vinculada não foi encontrada.",
      409,
    );
  }

  let inviteSent = false;
  if (!authUser && canDeliverByEmail) {
    let inviteResult: any;
    try {
      inviteResult = await admin.auth.admin.inviteUserByEmail(authEmail, {
        data: {
          nome: partner.nome,
          origem: "cadastro_gestor",
          tipo: "Aluno",
          partner_id: partner.id,
          matricula_acesso: partner.matricula_acesso || null,
        },
        redirectTo: finalRedirect,
      });
    } catch (error) {
      return failAccess(error);
    }

    if (!inviteResult.error && inviteResult.data?.user) {
      authUser = inviteResult.data.user;
      inviteSent = true;
    } else {
      // Uma requisição concorrente pode ter criado a mesma identidade entre a
      // consulta e o convite. Reconsultar torna o retry idempotente.
      try {
        authUser = await findAuthUserByEmail(admin, authEmail);
      } catch (error) {
        return failAccess(error);
      }
      if (!authUser) {
        return failAccess(
          inviteResult.error?.message ||
            "Não foi possível criar o acesso do aluno.",
        );
      }
    }
  }

  if (!authUser) {
    // Somente identidades sintéticas, sem caixa postal real, são confirmadas
    // pelo backend. E-mails reais sempre exigem que o aluno use o link enviado.
    if (!isSyntheticAuthEmail) {
      return failAccess(
        "O e-mail real de acesso deve coincidir com o contato do aluno para receber o convite.",
        400,
      );
    }
    let createdUser: any;
    try {
      createdUser = await admin.auth.admin.createUser({
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
    } catch (error) {
      return failAccess(error);
    }
    if (createdUser.error || !createdUser.data?.user) {
      // A identidade sintética também é única. Se outra requisição venceu a
      // corrida de criação, reutilize o usuário que acabou de ser persistido.
      try {
        authUser = await findAuthUserByEmail(admin, authEmail);
      } catch (error) {
        return failAccess(error);
      }
      if (!authUser) {
        return failAccess(
          createdUser.error?.message ||
            "Não foi possível criar o acesso por matrícula.",
        );
      }
    } else {
      authUser = createdUser.data.user;
    }
  }

  const ownershipError = authOwnershipError(partner, authUser);
  if (ownershipError) return failAccess(ownershipError, 409);

  const identityConflict = await findAuthIdentityConflict(
    admin,
    partner.id,
    authUser.id,
  );
  if (identityConflict.error) return failAccess(identityConflict.error);
  if (identityConflict.conflict) {
    return failAccess(identityConflict.conflict, 409);
  }

  const bindingError = await updateStudentAccess(
    admin,
    partner.id,
    accessWasActive
      ? {
        auth_user_id: authUser.id,
        auth_login_email: authEmail,
        acesso_erro: null,
      }
      : {
        auth_user_id: authUser.id,
        auth_login_email: authEmail,
        troca_senha_obrigatoria: true,
        acesso_status: "processando",
        acesso_erro: null,
        acesso_ativado_em: null,
      },
  );
  if (bindingError) return failAccess(bindingError, 500, authUser.id);

  if (inviteSent) {
    const sentAt = new Date().toISOString();
    const stateError = await updateStudentAccess(admin, partner.id, {
      auth_user_id: authUser.id,
      acesso_status: "convite_enviado",
      acesso_erro: null,
      convite_enviado_em: sentAt,
    });
    if (stateError) return failAccess(stateError, 500, authUser.id);

    return json({
      success: true,
      action: "invite",
      userId: authUser.id,
      inviteSent: true,
      recoveryLink: null,
      message: "Convite de acesso enviado com sucesso.",
    });
  }

  let deliveryError: string | null = null;
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
      const sentAt = new Date().toISOString();
      const stateError = await updateStudentAccess(
        admin,
        partner.id,
        accessWasActive
          ? {
            auth_user_id: authUser.id,
            acesso_erro: null,
          }
          : {
            auth_user_id: authUser.id,
            acesso_status: "convite_enviado",
            acesso_erro: null,
            convite_enviado_em: sentAt,
          },
      );
      if (stateError) return failAccess(stateError, 500, authUser.id);

      return json({
        success: true,
        action: "recovery",
        userId: authUser.id,
        inviteSent: false,
        recoveryEmailSent: true,
        recoveryLink: null,
        message: accessWasActive
          ? "O acesso do aluno já estava ativo. Enviamos um link para redefinir a senha, sem alterar o acesso atual."
          : "Já existia uma conta para este e-mail. Enviamos um link para concluir o acesso.",
      });
    }
    deliveryError = emailDelivery.message ||
      "Não foi possível enviar o link por e-mail.";
  }

  let recovery: any;
  try {
    recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email: authEmail,
      options: { redirectTo: finalRedirect },
    });
  } catch (error) {
    return failAccess(error, 500, authUser.id);
  }
  if (recovery.error) {
    return failAccess(
      recovery.error.message ||
        "Não foi possível gerar o link de primeiro acesso.",
      500,
      authUser.id,
    );
  }

  const pendingError = await updateStudentAccess(
    admin,
    partner.id,
    accessWasActive
      ? {
        auth_user_id: authUser.id,
        acesso_erro: deliveryError ? accessErrorSummary(deliveryError) : null,
      }
      : {
        auth_user_id: authUser.id,
        acesso_status: "pendente",
        acesso_erro: deliveryError ? accessErrorSummary(deliveryError) : null,
      },
  );
  if (pendingError) return failAccess(pendingError, 500, authUser.id);

  return json({
    success: true,
    action: "recovery",
    userId: authUser.id || recovery.data?.user?.id || null,
    inviteSent: false,
    recoveryEmailSent: false,
    recoveryLink: recovery.data?.properties?.action_link || null,
    message: accessWasActive
      ? "O acesso do aluno já estava ativo. Geramos apenas um link para redefinir a senha, sem alterar o acesso atual."
      : canDeliverByEmail
      ? "Geramos um link seguro para envio manual por um canal previamente verificado."
      : "Aluno sem e-mail: envie o link seguro por um canal previamente verificado, como o WhatsApp cadastrado.",
  });
};
