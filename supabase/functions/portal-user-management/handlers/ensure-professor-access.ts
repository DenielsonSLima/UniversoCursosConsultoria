import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import { findAuthIdentityConflict } from "../auth-identity-ownership.ts";
import { handleLinkProfessorAuthIdentity } from "./link-professor-auth-identity.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import type {
  HandlerContext,
  InstitutionalProfileLinkState,
  Partner,
} from "../types.ts";

const ACTION = "ensure-professor-access";
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INVITE_OPERATION_NONCE_KEY = "invite_operation_nonce";

type AuthUserRecord = {
  id?: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type AuthUserResult = {
  data?: { user?: AuthUserRecord | null } | null;
  error?: { message?: string } | null;
};

type SystemUserCandidate = {
  email?: string | null;
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

const hasInviteOperationNonce = (
  authUser: AuthUserRecord,
  expectedNonce: string,
  partnerId: string,
) =>
  String(authUser?.user_metadata?.[INVITE_OPERATION_NONCE_KEY] || "") ===
    expectedNonce &&
  authUser?.user_metadata?.origem === "cadastro_professor" &&
  String(authUser?.user_metadata?.partner_id || "") === partnerId;

const readCurrentPartnerBinding = async (
  admin: HandlerContext["admin"],
  partnerId: string,
) => {
  try {
    const { data, error } = await admin
      .from("parceiros")
      .select("id, tipo, status, email, auth_user_id, auth_login_email")
      .eq("id", partnerId)
      .maybeSingle();
    if (error) {
      return {
        partner: null,
        error: error.message ||
          "Não foi possível verificar o vínculo atual do professor.",
      };
    }
    return { partner: data || null, error: null };
  } catch (error) {
    return {
      partner: null,
      error: error instanceof Error
        ? error.message
        : "Não foi possível verificar o vínculo atual do professor.",
    };
  }
};

/**
 * Auth e dados do parceiro não participam da mesma transação. Depois que o
 * convite foi criado, apagar o Auth com base em uma leitura anterior deixa
 * uma janela em que outro fluxo pode tê-lo vinculado. Preserve a identidade
 * para reconciliação manual: sem perfil vinculado ela não ganha acesso ao
 * portal institucional, e nunca arriscamos apagar uma conta de terceiro.
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
 * Prepara o primeiro acesso de um Professor sem ampliar o vínculo especial
 * Professor↔Gestor. Contas existentes nunca são apropriadas por e-mail: a
 * única reutilização é delegada ao handler que exige CPF e privilégio global.
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
      return json({
        success: false,
        error: error instanceof Error
          ? error.message
          : "Não foi possível verificar a identidade de acesso do professor.",
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

  const { data: systemUserCandidates, error: systemUserError } = await admin
    .from("usuarios_sistema")
    .select("id, email, auth_user_id, cpf")
    .ilike("email", email)
    .limit(2);
  if (systemUserError) {
    return json({
      success: false,
      error: "Não foi possível verificar o perfil institucional existente.",
    }, 500);
  }

  const matchingSystemUser = (systemUserCandidates || []).find(
    (candidate: SystemUserCandidate) =>
      normalizeEmail(candidate?.email) === email,
  );
  if (matchingSystemUser) {
    return handleLinkProfessorAuthIdentity(context, partner);
  }

  let existingAuthUser: AuthUserRecord | null;
  try {
    existingAuthUser = await findAuthUserByEmail(admin, email);
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Não foi possível localizar usuário no Supabase Auth.",
    }, 500);
  }

  if (existingAuthUser?.id) {
    const currentBinding = await readCurrentPartnerBinding(admin, partner.id);
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
      partner.id,
      existingAuthUser.id,
    );
    if (identityConflict.error) {
      return json({ success: false, error: identityConflict.error }, 500);
    }
    if (identityConflict.conflict) {
      return json({ success: false, error: identityConflict.conflict }, 409);
    }

    return json({
      success: false,
      error:
        "Já existe uma identidade de acesso para este e-mail sem vínculo seguro com este professor. Regularize a identidade antes de enviar um novo convite.",
    }, 409);
  }

  const redirectResolution = resolveRedirectTarget("/recuperar-senha");
  if (!redirectResolution.redirectTo) {
    return json({
      success: false,
      error: redirectResolution.error ||
        "Não foi possível preparar o link de primeiro acesso.",
    }, redirectResolution.status);
  }

  const invitationNonce = crypto.randomUUID();
  let inviteResult: AuthUserResult;
  try {
    inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        nome: partner.nome,
        origem: "cadastro_professor",
        tipo: "Professor",
        partner_id: partner.id,
        [INVITE_OPERATION_NONCE_KEY]: invitationNonce,
      },
      redirectTo: redirectResolution.redirectTo,
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Não foi possível enviar o convite de primeiro acesso ao professor.",
    }, 500);
  }

  const invitedAuthUser = !inviteResult.error && inviteResult.data?.user
    ? inviteResult.data.user
    : null;
  if (!invitedAuthUser?.id) {
    // Não vincule uma identidade reencontrada após falha incerta do convite:
    // user_metadata é alterável pelo titular e não prova a sua titularidade.
    const currentBinding = await readCurrentPartnerBinding(admin, partner.id);
    if (currentBinding.error) {
      return json({ success: false, error: currentBinding.error }, 500);
    }
    if (currentBinding.partner?.auth_user_id) {
      return alreadyLinked(context, currentBinding.partner.auth_user_id);
    }
    return json({
      success: false,
      error: inviteResult.error?.message ||
        "Não foi possível confirmar o convite de primeiro acesso. Regularize este e-mail antes de tentar novamente.",
    }, 500);
  }

  // GoTrue pode reenviar convite para uma identidade não confirmada criada
  // por outra operação. O nonce só existe quando esta chamada criou o Auth;
  // sem essa prova, não vinculamos uma conta preexistente ao Professor.
  if (!hasInviteOperationNonce(invitedAuthUser, invitationNonce, partner.id)) {
    return json({
      success: false,
      error:
        "Não foi possível comprovar que o convite criou uma nova identidade para este professor. Regularize este e-mail antes de tentar novamente.",
    }, 409);
  }

  if (normalizeEmail(invitedAuthUser.email) !== email) {
    return preserveInvitedAuthForReconciliation(
      context,
      "A identidade criada para o convite não corresponde ao e-mail do professor.",
      409,
    );
  }

  const identityConflict = await findAuthIdentityConflict(
    admin,
    partner.id,
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

  const currentBeforeLink = await readCurrentPartnerBinding(admin, partner.id);
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
    const currentBinding = await readCurrentPartnerBinding(admin, partner.id);
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
      partner.id,
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

    const status = linkError?.code === "23505" ? 409 : 500;
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
    inviteSent: true,
    profileLinked: true,
    profileLinkState: "linked",
    message:
      "Convite de primeiro acesso enviado para o e-mail informado do professor.",
  });
};
