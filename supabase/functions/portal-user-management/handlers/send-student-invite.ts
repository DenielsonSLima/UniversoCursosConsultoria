import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import { findAuthIdentityConflict } from "../auth-identity-ownership.ts";
import {
  buildPartnerInviteOperationMetadata,
  readValidPartnerInviteOperationMarker,
} from "./partner-invite-reconciliation.ts";
import { resolveRedirectTarget } from "../redirects.ts";
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
import { hasCreatedStudentPassword } from "./student-first-access-state.ts";
import { createStudentInviteState } from "./student-invite-state.ts";
import { handleStudentInviteRecovery } from "./student-invite-recovery.ts";

type AuthUserRecord = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type AuthOperationResult = {
  data?: { user?: AuthUserRecord | null } | null;
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
  const passwordWasCreated = hasCreatedStudentPassword(partner);
  const accessWasActive = passwordWasCreated &&
    partner.acesso_status === "ativo" &&
    partner.troca_senha_obrigatoria === false;
  const state = createStudentInviteState(context, partner);
  const { failAccess, failInternal } = createStudentInviteFailureResponder(
    context,
    authEmail,
    passwordWasCreated,
    state,
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

  if (!passwordWasCreated) {
    const processing = await state.write({
      acesso_status: "processando",
      acesso_erro: null,
    });
    if (processing.error) {
      return failInternal("mark-processing", processing.error);
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

  if (passwordWasCreated && !authUser) {
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
    const invitePermit = await state.check();
    if (invitePermit.error) {
      return failAccess(invitePermit.error, invitePermit.status);
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
      state.markInviteSent();
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
    const createPermit = await state.check();
    if (createPermit.error) {
      return failAccess(createPermit.error, createPermit.status);
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
    if (passwordWasCreated && !authUser.email_confirmed_at) {
      return json({
        success: false,
        error:
          "A senha já criada foi preservada. Confirme o e-mail antes de reutilizar o acesso nos demais perfis.",
      }, 409);
    }
    const sharedBinding = await bindSharedStudentIdentity(
      admin,
      partner,
      authUser.id,
      authEmail,
      accessWasActive && Boolean(authUser.email_confirmed_at),
      state.write,
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
      state.write,
    );
    if (initialBinding.error) {
      return failAccess(initialBinding.error, initialBinding.status);
    }
  } else {
    const binding = await state.write(
      passwordWasCreated
        ? { auth_login_email: authEmail, acesso_erro: null }
        : {
          auth_login_email: authEmail,
          troca_senha_obrigatoria: true,
          acesso_status: "processando",
          acesso_erro: null,
          acesso_ativado_em: null,
        },
    );
    if (binding.error) {
      return failInternal("update-linked-student", binding.error);
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

  return handleStudentInviteRecovery({
    context,
    state,
    authUserId: authUser.id,
    authEmail,
    canDeliverByEmail,
    passwordWasCreated,
    accessWasActive,
    finalRedirect,
    options,
    failure: { failAccess, failInternal },
  });
};
