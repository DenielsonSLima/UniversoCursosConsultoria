import {
  findAuthUserByEmail,
  normalizeEmail,
  sendRecoveryEmail,
} from "../auth-users.ts";
import { findAuthIdentityConflict } from "../auth-identity-ownership.ts";
import {
  buildPartnerInviteOperationMetadata,
  readValidPartnerInviteOperationMarker,
} from "./partner-invite-reconciliation.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import { accessErrorSummary, updateStudentAccess } from "../student-access.ts";
import type {
  HandlerContext,
  Partner,
  PublicApiKeyResolution,
} from "../types.ts";
import {
  authOwnershipError,
  bindCreatedStudentIdentity,
  bindSharedStudentIdentity,
} from "./student-access-identity.ts";
import { createStudentInviteFailureResponder } from "./student-invite-failure.ts";

type AuthUserRecord = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type AuthOperationResult = {
  data?: { user?: AuthUserRecord | null } | null;
  error?: { code?: string; message?: string } | null;
};

type RecoveryResult = {
  data?: {
    user?: { id?: string | null } | null;
    properties?: { action_link?: string | null } | null;
  } | null;
  error?: { code?: string; message?: string } | null;
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
    partner.troca_senha_obrigatoria === false &&
    Boolean(partner.senha_atualizada_em) &&
    !partner.senha_temporaria_pendente &&
    !partner.senha_temporaria_emissao_id &&
    !partner.senha_temporaria_emissao_iniciada_em &&
    !partner.senha_temporaria_emissao_senha_alterada_em;
  const { failAccess, failInternal } = createStudentInviteFailureResponder(
    context,
    partner,
    authEmail,
    accessWasActive,
  );

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
      return failInternal("mark-processing", processingError);
    }
  }

  let authUser: AuthUserRecord | null;
  let identityOrigin:
    | "linked"
    | "existing"
    | "invited"
    | "reconciled-invite"
    | "synthetic-created" = partner.auth_user_id ? "linked" : "existing";
  if (partner.auth_user_id) {
    let existingIdentity: AuthOperationResult;
    try {
      existingIdentity = await admin.auth.admin.getUserById(
        partner.auth_user_id,
      );
    } catch (error) {
      return failInternal("get-auth-user", error);
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
      );
    }
  } else {
    try {
      authUser = await findAuthUserByEmail(admin, authEmail);
    } catch (error) {
      return failInternal("find-auth-user", error);
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
    const invitationNonce = crypto.randomUUID();
    let invitationMetadata: Record<string, unknown>;
    try {
      invitationMetadata = await buildPartnerInviteOperationMetadata(
        context,
        invitationNonce,
        partner,
        authEmail,
        {
          nome: partner.nome,
          matricula_acesso: partner.matricula_acesso || null,
        },
      );
    } catch (error) {
      return failInternal("build-invite-proof", error);
    }
    let inviteResult: AuthOperationResult;
    try {
      inviteResult = await admin.auth.admin.inviteUserByEmail(authEmail, {
        data: invitationMetadata,
        redirectTo: finalRedirect,
      });
    } catch (error) {
      return failInternal("invite-auth-user", error);
    }

    if (!inviteResult.error && inviteResult.data?.user) {
      const invitedAuthUser = inviteResult.data.user;
      let inviteMarker;
      try {
        inviteMarker = await readValidPartnerInviteOperationMarker(
          context,
          invitedAuthUser,
          partner,
          authEmail,
        );
      } catch (error) {
        return failInternal("validate-returned-invite-proof", error);
      }
      if (!inviteMarker) {
        return failAccess(
          "Não foi possível comprovar que o convite criou uma nova identidade para este aluno.",
          409,
        );
      }
      authUser = invitedAuthUser;
      inviteSent = true;
      identityOrigin = "invited";
    } else {
      // Uma requisição concorrente pode ter criado a mesma identidade entre a
      // consulta e o convite. Reconsultar torna o retry idempotente.
      try {
        authUser = await findAuthUserByEmail(admin, authEmail);
      } catch (error) {
        return failInternal("requery-invited-auth-user", error);
      }
      if (!authUser) {
        return failInternal("invite-auth-user-result", inviteResult.error);
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
    let createdUser: AuthOperationResult;
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
      return failInternal("create-synthetic-auth-user", error);
    }
    if (createdUser.error || !createdUser.data?.user) {
      // A identidade sintética também é única. Se outra requisição venceu a
      // corrida de criação, reutilize o usuário que acabou de ser persistido.
      try {
        authUser = await findAuthUserByEmail(admin, authEmail);
      } catch (error) {
        return failInternal("requery-synthetic-auth-user", error);
      }
      if (!authUser) {
        return failInternal(
          "create-synthetic-auth-user-result",
          createdUser.error,
        );
      }
    } else {
      authUser = createdUser.data.user;
      identityOrigin = "synthetic-created";
    }
  }

  const ownershipError = authOwnershipError(partner, authUser, authEmail);
  if (ownershipError) return failAccess(ownershipError, 409);

  const identityConflict = await findAuthIdentityConflict(
    admin,
    partner,
    authUser.id,
  );
  if (identityConflict.error) return failAccess(identityConflict.error);
  if (identityConflict.conflict) {
    return failAccess(identityConflict.conflict, 409);
  }

  if (
    identityOrigin === "existing" && !partner.auth_user_id &&
    !identityConflict.hasCompatibleProfile
  ) {
    if (!canDeliverByEmail) {
      return failAccess(
        "Já existe uma identidade para este e-mail, mas nenhum perfil canônico comprova que pertence a este aluno.",
        409,
      );
    }
    let inviteMarker;
    try {
      inviteMarker = await readValidPartnerInviteOperationMarker(
        context,
        authUser,
        partner,
        authEmail,
      );
    } catch (error) {
      return failInternal("validate-existing-invite-proof", error);
    }
    if (!inviteMarker) {
      return failAccess(
        "Já existe uma identidade para este e-mail, mas nenhum perfil canônico ou convite assinado comprova que pertence a este aluno.",
        409,
      );
    }
    identityOrigin = "reconciled-invite";
  }

  const identityWasCreated = identityOrigin === "invited" ||
    identityOrigin === "reconciled-invite" ||
    identityOrigin === "synthetic-created";
  if (identityWasCreated && identityConflict.hasCompatibleProfile) {
    return failAccess(
      "A identidade ganhou outro vínculo durante a criação do acesso. Revise os cadastros antes de tentar novamente.",
      409,
    );
  }

  if (!identityWasCreated && identityConflict.hasCompatibleProfile) {
    const sharedBinding = await bindSharedStudentIdentity(
      admin,
      partner,
      authUser.id,
      authEmail,
      accessWasActive,
    );
    if (sharedBinding.error) {
      return failAccess(sharedBinding.error, sharedBinding.status);
    }

    return json({
      success: true,
      action: "link-existing-identity",
      userId: authUser.id,
      inviteSent: false,
      recoveryEmailSent: false,
      recoveryLink: null,
      profileLinked: !partner.auth_user_id,
      profileLinkState: partner.auth_user_id ? "already_linked" : "linked",
      studentAccessPending: !sharedBinding.credentialReady,
      message: sharedBinding.credentialReady
        ? "O acesso existente também foi vinculado ao perfil de Aluno. A senha atual foi preservada."
        : "A identidade foi vinculada ao perfil de Aluno, mas o acesso permanece pendente até a pessoa concluir o primeiro acesso já iniciado.",
    });
  }

  if (identityWasCreated) {
    const initialBinding = await bindCreatedStudentIdentity(
      admin,
      partner,
      authUser.id,
      authEmail,
      inviteSent || identityOrigin === "reconciled-invite",
    );
    if (initialBinding.error) {
      return failAccess(initialBinding.error, initialBinding.status);
    }
  } else {
    const bindingError = await updateStudentAccess(
      admin,
      partner.id,
      accessWasActive ? { auth_login_email: authEmail, acesso_erro: null } : {
        auth_login_email: authEmail,
        troca_senha_obrigatoria: true,
        acesso_status: "processando",
        acesso_erro: null,
        acesso_ativado_em: null,
      },
    );
    if (bindingError) {
      return failInternal("update-linked-student", bindingError);
    }
  }

  if (inviteSent) {
    return json({
      success: true,
      action: "invite",
      userId: authUser.id,
      inviteSent: true,
      recoveryLink: null,
      message: "Convite de acesso enviado com sucesso.",
    });
  }

  if (identityOrigin === "reconciled-invite") {
    return json({
      success: true,
      action: "reconcile-invite",
      userId: authUser.id,
      inviteSent: false,
      recoveryEmailSent: false,
      recoveryLink: null,
      profileLinked: true,
      profileLinkState: "linked",
      message:
        "O convite anterior foi reconciliado e vinculado ao perfil do aluno sem novo envio.",
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
            acesso_erro: null,
          }
          : {
            acesso_status: "convite_enviado",
            acesso_erro: null,
            convite_enviado_em: sentAt,
          },
      );
      if (stateError) {
        return failInternal("mark-recovery-sent", stateError);
      }

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

  let recovery: RecoveryResult;
  try {
    recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email: authEmail,
      options: { redirectTo: finalRedirect },
    });
  } catch (error) {
    return failInternal("generate-recovery-link", error);
  }
  if (recovery.error) {
    return failInternal("generate-recovery-link-result", recovery.error);
  }

  const pendingError = await updateStudentAccess(
    admin,
    partner.id,
    accessWasActive
      ? {
        acesso_erro: deliveryError ? accessErrorSummary(deliveryError) : null,
      }
      : {
        acesso_status: "pendente",
        acesso_erro: deliveryError ? accessErrorSummary(deliveryError) : null,
      },
  );
  if (pendingError) {
    return failInternal("mark-access-pending", pendingError);
  }

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
