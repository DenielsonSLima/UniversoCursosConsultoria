import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import { findAuthIdentityConflict } from "../auth-identity-ownership.ts";
import { handleLinkProfessorAuthIdentity } from "./link-professor-auth-identity.ts";
import { logPortalHandlerFailure } from "./handler-error-log.ts";
import {
  buildPartnerInviteOperationMetadata,
  readValidPartnerInviteOperationMarker,
} from "./partner-invite-reconciliation.ts";
import { readCurrentProfessorBinding } from "./professor-access-state.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import type {
  HandlerContext,
  InstitutionalProfileLinkState,
  Partner,
} from "../types.ts";

const ACTION = "ensure-professor-access";
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type AuthUserRecord = {
  id?: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type AuthUserResult = {
  data?: { user?: AuthUserRecord | null } | null;
  error?: { message?: string } | null;
};

const noProfessorAccess = (
  context: HandlerContext,
  profileLinkState: Exclude<InstitutionalProfileLinkState, "linked">,
  message?: string,
) =>
  context.json({
    success: true,
    action: ACTION,
    profileLinked: false,
    profileLinkState,
    ...(message ? { message } : {}),
  });

const isInactivePartner = (status?: string | null) => {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized.length > 0 && !["ATIVO", "ATIVA", "ACTIVE"].includes(
    normalized,
  );
};

/**
 * Auth e dados do parceiro não participam da mesma transação. Depois que o
 * convite foi criado, apagar o Auth com base em uma leitura anterior deixa
 * uma janela em que outro fluxo pode tê-lo vinculado. Preserve a identidade
 * para reconciliação segura; sem vínculo ela não ganha acesso institucional.
 */
const preserveInvitedAuthForReconciliation = (
  context: HandlerContext,
  failureMessage: string,
  failureStatus = 500,
) =>
  context.json({
    success: false,
    error:
      `${failureMessage} A identidade convidada foi preservada para reconciliação segura deste e-mail.`,
  }, failureStatus);

const alreadyLinked = (
  context: HandlerContext,
  authUserId: string,
) =>
  context.json({
    success: true,
    action: ACTION,
    userId: authUserId,
    profileLinked: false,
    profileLinkState: "already_linked",
  });

/**
 * Prepara o primeiro acesso de um Professor. Uma identidade preexistente só
 * é reutilizada quando outro perfil canônico comprova o mesmo CPF e e-mail;
 * nesse caso a senha é preservada e nenhum novo convite é enviado.
 */
export const handleEnsureProfessorAccess = async (
  context: HandlerContext,
  partner: Partner,
) => {
  const { admin, json } = context;
  if (partner.tipo !== "Professor") {
    return json({
      success: false,
      error: "Somente perfis de Professor podem receber convite de acesso.",
    }, 400);
  }

  if (partner.auth_user_id) {
    let authData: AuthUserResult;
    try {
      authData = await admin.auth.admin.getUserById(partner.auth_user_id);
    } catch (error) {
      logPortalHandlerFailure(ACTION, "get-auth-user", error);
      return json({
        success: false,
        error:
          "Não foi possível verificar a identidade de acesso do professor.",
      }, 500);
    }

    const authUser = authData?.data?.user;
    if (authData?.error || !authUser?.id) {
      return json({
        success: false,
        error:
          "O vínculo de autenticação deste professor está inconsistente e requer revisão.",
      }, 409);
    }

    const authEmail = normalizeEmail(authUser.email);
    const loginEmail = normalizeEmail(partner.auth_login_email);
    const contactEmail = normalizeEmail(partner.email);
    if (
      (loginEmail && authEmail !== loginEmail) ||
      (contactEmail && authEmail !== contactEmail)
    ) {
      return json({
        success: false,
        error:
          "O e-mail cadastrado não confere com a identidade de acesso já vinculada ao professor. Altere o login somente pelo fluxo seguro de administração.",
      }, 409);
    }

    const identityOwnership = await findAuthIdentityConflict(
      admin,
      partner,
      authUser.id,
    );
    if (identityOwnership.error) {
      return json({ success: false, error: identityOwnership.error }, 500);
    }
    if (identityOwnership.conflict) {
      return json({ success: false, error: identityOwnership.conflict }, 409);
    }

    return alreadyLinked(context, authUser.id);
  }

  if (isInactivePartner(partner.status)) {
    return noProfessorAccess(
      context,
      "not_eligible",
      "O professor está inativo; nenhum convite de acesso foi enviado.",
    );
  }

  const email = normalizeEmail(partner.email);
  if (!email) return noProfessorAccess(context, "not_eligible");
  if (!EMAIL_PATTERN.test(email)) {
    return json({
      success: false,
      error: "Informe um e-mail válido antes de enviar o convite ao professor.",
    }, 400);
  }

  let existingAuthUser: AuthUserRecord | null;
  try {
    existingAuthUser = await findAuthUserByEmail(admin, email);
  } catch (error) {
    logPortalHandlerFailure(ACTION, "find-auth-user", error);
    return json({
      success: false,
      error: "Não foi possível localizar a identidade de acesso do professor.",
    }, 500);
  }

  let invitedAuthUser: (AuthUserRecord & { id: string }) | null = null;
  let inviteOperationRequestId: string | null = null;
  let inviteSent = false;

  if (existingAuthUser?.id) {
    const currentBinding = await readCurrentProfessorBinding(admin, partner.id);
    if (currentBinding.error) {
      return json({ success: false, error: currentBinding.error }, 500);
    }
    if (currentBinding.partner?.auth_user_id === existingAuthUser.id) {
      return alreadyLinked(context, existingAuthUser.id);
    }
    if (currentBinding.partner?.auth_user_id) {
      return json({
        success: false,
        error:
          "O vínculo de acesso do professor mudou durante a operação. Atualize o cadastro e tente novamente.",
      }, 409);
    }

    const identityConflict = await findAuthIdentityConflict(
      admin,
      partner,
      existingAuthUser.id,
    );
    if (identityConflict.error) {
      return json({ success: false, error: identityConflict.error }, 500);
    }
    if (identityConflict.conflict) {
      return json({ success: false, error: identityConflict.conflict }, 409);
    }

    if (identityConflict.hasCompatibleProfile) {
      return handleLinkProfessorAuthIdentity(context, partner);
    }

    try {
      const operation = await readValidPartnerInviteOperationMarker(
        context,
        existingAuthUser,
        partner,
        email,
      );
      if (operation) {
        invitedAuthUser = { ...existingAuthUser, id: existingAuthUser.id };
        inviteOperationRequestId = operation.requestId;
      }
    } catch (error) {
      logPortalHandlerFailure(ACTION, "validate-existing-invite-proof", error);
      return json({
        success: false,
        error:
          "Não foi possível validar a prova segura do convite existente do professor.",
      }, 500);
    }

    if (!invitedAuthUser) {
      return json({
        success: false,
        error:
          "Já existe uma identidade de acesso para este e-mail sem vínculo seguro com este professor. Regularize a identidade antes de enviar um novo convite.",
      }, 409);
    }
  }

  if (!invitedAuthUser) {
    const redirectResolution = resolveRedirectTarget("/recuperar-senha");
    if (!redirectResolution.redirectTo) {
      return json({
        success: false,
        error: redirectResolution.error ||
          "Não foi possível preparar o link de primeiro acesso.",
      }, redirectResolution.status);
    }

    const invitationNonce = crypto.randomUUID();
    let invitationMetadata: Record<string, unknown>;
    try {
      invitationMetadata = await buildPartnerInviteOperationMetadata(
        context,
        invitationNonce,
        partner,
        email,
        { nome: partner.nome },
      );
    } catch (error) {
      logPortalHandlerFailure(ACTION, "build-invite-proof", error);
      return json({
        success: false,
        error:
          "A configuração segura de reconciliação do convite está indisponível.",
      }, 500);
    }

    let inviteResult: AuthUserResult | null = null;
    try {
      inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
        data: invitationMetadata,
        redirectTo: redirectResolution.redirectTo,
      });
    } catch (error) {
      logPortalHandlerFailure(ACTION, "invite-auth-user", error);
    }
    if (inviteResult?.error) {
      logPortalHandlerFailure(
        ACTION,
        "invite-auth-user-result",
        inviteResult.error,
      );
    }

    const returnedAuthUser = !inviteResult?.error && inviteResult?.data?.user
      ? inviteResult.data.user
      : null;
    let candidateAuthUser = returnedAuthUser;
    if (!candidateAuthUser?.id) {
      const currentBinding = await readCurrentProfessorBinding(
        admin,
        partner.id,
      );
      if (currentBinding.error) {
        return json({ success: false, error: currentBinding.error }, 500);
      }
      if (currentBinding.partner?.auth_user_id) {
        return alreadyLinked(context, currentBinding.partner.auth_user_id);
      }
      try {
        candidateAuthUser = await findAuthUserByEmail(admin, email);
      } catch (error) {
        logPortalHandlerFailure(ACTION, "requery-invited-auth-user", error);
      }
      if (!candidateAuthUser?.id) {
        return json({
          success: false,
          error:
            "Não foi possível confirmar o convite de primeiro acesso. Regularize este e-mail antes de tentar novamente.",
        }, 500);
      }
    }

    if (normalizeEmail(candidateAuthUser.email) !== email) {
      return preserveInvitedAuthForReconciliation(
        context,
        "A identidade criada para o convite não corresponde ao e-mail do professor.",
        409,
      );
    }

    try {
      const operation = await readValidPartnerInviteOperationMarker(
        context,
        candidateAuthUser,
        partner,
        email,
      );
      if (operation) {
        invitedAuthUser = { ...candidateAuthUser, id: candidateAuthUser.id };
        inviteOperationRequestId = operation.requestId;
        inviteSent = Boolean(returnedAuthUser);
      }
    } catch (error) {
      logPortalHandlerFailure(ACTION, "validate-returned-invite-proof", error);
      return preserveInvitedAuthForReconciliation(
        context,
        "Não foi possível validar a prova segura do convite do professor.",
      );
    }
    if (!invitedAuthUser) {
      return preserveInvitedAuthForReconciliation(
        context,
        "Não foi possível comprovar que o convite criou uma nova identidade para este professor.",
        409,
      );
    }
  }

  if (!inviteOperationRequestId) {
    return preserveInvitedAuthForReconciliation(
      context,
      "Não foi possível recuperar a operação segura do convite do professor.",
      409,
    );
  }

  const identityConflict = await findAuthIdentityConflict(
    admin,
    partner,
    invitedAuthUser.id,
  );
  if (identityConflict.error) {
    return preserveInvitedAuthForReconciliation(
      context,
      identityConflict.error,
    );
  }
  if (identityConflict.conflict) {
    return preserveInvitedAuthForReconciliation(
      context,
      identityConflict.conflict,
      409,
    );
  }
  if (identityConflict.hasCompatibleProfile) {
    return preserveInvitedAuthForReconciliation(
      context,
      "A identidade ganhou outro vínculo durante o envio do convite. Revise os cadastros antes de tentar novamente.",
      409,
    );
  }

  const currentBeforeLink = await readCurrentProfessorBinding(
    admin,
    partner.id,
  );
  if (currentBeforeLink.error) {
    return preserveInvitedAuthForReconciliation(
      context,
      "Não foi possível verificar o cadastro do professor antes de vincular o convite.",
    );
  }
  if (currentBeforeLink.partner?.auth_user_id === invitedAuthUser.id) {
    return alreadyLinked(context, invitedAuthUser.id);
  }
  if (
    !currentBeforeLink.partner ||
    currentBeforeLink.partner.auth_user_id ||
    currentBeforeLink.partner.tipo !== "Professor" ||
    normalizeEmail(currentBeforeLink.partner.email) !== email ||
    isInactivePartner(currentBeforeLink.partner.status)
  ) {
    return preserveInvitedAuthForReconciliation(
      context,
      "O cadastro do professor mudou durante a preparação do convite. Atualize os dados e tente novamente.",
      409,
    );
  }

  let linkQuery = admin
    .from("parceiros")
    .update({
      auth_user_id: invitedAuthUser.id,
      auth_login_email: email,
      acesso_institucional_origem: "CONVITE",
      primeiro_acesso_institucional_pendente: true,
      primeiro_acesso_institucional_operacao_id: inviteOperationRequestId,
    })
    .eq("id", partner.id)
    .eq("tipo", "Professor")
    .eq("email", email)
    .is("auth_user_id", null)
    .select("id, auth_user_id, auth_login_email");
  if (partner.status) {
    linkQuery = linkQuery.eq("status", partner.status);
  }
  const { data: linkedPartner, error: linkError } = await linkQuery
    .maybeSingle();

  if (linkError || !linkedPartner) {
    if (linkError) {
      logPortalHandlerFailure(ACTION, "link-professor", linkError);
    }
    const currentBinding = await readCurrentProfessorBinding(admin, partner.id);
    if (
      !currentBinding.error &&
      currentBinding.partner?.auth_user_id === invitedAuthUser.id
    ) {
      return alreadyLinked(context, invitedAuthUser.id);
    }

    // Nunca apague o Auth recém-convidado neste caminho: outra operação pode
    // vinculá-lo logo após qualquer leitura local. O caso é encaminhado para
    // reconciliação, mantendo a conta sem acesso institucional até o vínculo.
    const postLinkConflict = await findAuthIdentityConflict(
      admin,
      partner,
      invitedAuthUser.id,
    );
    if (postLinkConflict.error) {
      return json({
        success: false,
        error:
          "O vínculo do convite falhou e não pôde ser verificado com segurança. Regularize este e-mail antes de tentar novamente.",
      }, 500);
    }
    if (postLinkConflict.conflict) {
      return json({
        success: false,
        error: postLinkConflict.conflict,
      }, 409);
    }

    const status = ["23505", "23514"].includes(linkError?.code || "")
      ? 409
      : 500;
    return preserveInvitedAuthForReconciliation(
      context,
      status === 409
        ? "Esta identidade de acesso já pertence a outro parceiro."
        : "Não foi possível vincular o convite de acesso ao professor.",
      status,
    );
  }

  return json({
    success: true,
    action: ACTION,
    userId: invitedAuthUser.id,
    inviteSent,
    profileLinked: true,
    profileLinkState: "linked",
    institutionalAccessPending: true,
    message: inviteSent
      ? "Convite de primeiro acesso enviado para o e-mail informado do professor."
      : "Convite de primeiro acesso existente reconciliado com o professor.",
  });
};
