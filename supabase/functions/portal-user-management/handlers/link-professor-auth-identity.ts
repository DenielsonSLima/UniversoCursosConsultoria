import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import { findAuthIdentityConflict } from "../auth-identity-ownership.ts";
import { getGestorScope } from "../gestor-access.ts";
import { gestorHasModule } from "../permissions.ts";
import { logPortalHandlerFailure } from "./handler-error-log.ts";
import type {
  HandlerContext,
  InstitutionalProfileLinkState,
  Partner,
} from "../types.ts";

const ACTION = "link-professor-auth-identity";

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const noProfileLink = (
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

const identityFailure = (
  context: HandlerContext,
  error: string,
  status: number,
) => context.json({ success: false, error }, status);

/**
 * Vincula Professor a um Auth canonicamente comprovado por outro papel.
 * A operação continua restrita a gestor global com Configurações e nunca usa
 * user_metadata, envia convite ou altera a senha da identidade reaproveitada.
 */
const linkProfessorAuthIdentity = async (
  context: HandlerContext,
  partner: Partner,
) => {
  if (partner.tipo !== "Professor") {
    return identityFailure(
      context,
      "Somente perfis de Professor podem receber este vínculo de acesso.",
      400,
    );
  }

  const scope = await getGestorScope(context.admin, context.gestor);
  if (!scope.global || !gestorHasModule(context.gestor, "configuracoes")) {
    return noProfileLink(
      context,
      "requires_global_configuration_access",
      "O cadastro foi salvo. Um gestor global com acesso a Configurações deve concluir o vínculo multipapel.",
    );
  }

  const email = normalizeEmail(partner.auth_login_email || partner.email);

  if (partner.auth_user_id) {
    let authResult: any;
    try {
      authResult = await context.admin.auth.admin.getUserById(
        partner.auth_user_id,
      );
    } catch (error) {
      logPortalHandlerFailure(ACTION, "get-linked-auth-user", error);
      return identityFailure(
        context,
        "Não foi possível verificar a identidade de acesso do professor.",
        500,
      );
    }

    const authUser = authResult?.data?.user;
    if (authResult?.error || !authUser?.id) {
      return identityFailure(
        context,
        "A identidade de acesso vinculada ao professor não está mais disponível.",
        409,
      );
    }
    if (email && normalizeEmail(authUser.email) !== email) {
      return identityFailure(
        context,
        "O e-mail do professor não confere com a identidade de acesso institucional.",
        409,
      );
    }

    const ownership = await findAuthIdentityConflict(
      context.admin,
      partner,
      authUser.id,
    );
    if (ownership.error) return identityFailure(context, ownership.error, 500);
    if (ownership.conflict) {
      return identityFailure(context, ownership.conflict, 409);
    }
    return noProfileLink(context, "already_linked");
  }

  if (!email) return noProfileLink(context, "not_eligible");

  const professorCpf = onlyDigits(partner.cpf_cnpj);
  if (professorCpf.length !== 11) {
    return identityFailure(
      context,
      "Informe o CPF do professor antes de vincular o acesso institucional.",
      409,
    );
  }

  let authUser: any;
  try {
    authUser = await findAuthUserByEmail(context.admin, email);
  } catch (error) {
    logPortalHandlerFailure(ACTION, "find-auth-user", error);
    return identityFailure(
      context,
      "Não foi possível localizar a identidade de acesso existente.",
      500,
    );
  }
  if (!authUser?.id) {
    return noProfileLink(
      context,
      "no_matching_gestor",
      "Nenhuma identidade de acesso existente e compatível foi localizada.",
    );
  }
  if (normalizeEmail(authUser.email) !== email) {
    return identityFailure(
      context,
      "O e-mail do professor não confere com a identidade de acesso institucional.",
      409,
    );
  }

  const ownership = await findAuthIdentityConflict(
    context.admin,
    partner,
    authUser.id,
  );
  if (ownership.error) return identityFailure(context, ownership.error, 500);
  if (ownership.conflict) {
    return identityFailure(context, ownership.conflict, 409);
  }
  if (!ownership.hasCompatibleProfile) {
    return noProfileLink(
      context,
      "no_matching_gestor",
      "O Auth localizado não possui outro perfil canônico que comprove a identidade desta pessoa.",
    );
  }

  let linkQuery = context.admin
    .from("parceiros")
    .update({
      auth_user_id: authUser.id,
      auth_login_email: email,
      acesso_institucional_origem: "IDENTIDADE_EXISTENTE",
      primeiro_acesso_institucional_pendente: false,
      primeiro_acesso_institucional_operacao_id: null,
    })
    .eq("id", partner.id)
    .eq("tipo", "Professor")
    .eq("email", partner.email)
    .eq("cpf_cnpj", partner.cpf_cnpj)
    .is("auth_user_id", null)
    .select(
      "id, auth_user_id, primeiro_acesso_institucional_pendente",
    );
  linkQuery = partner.auth_login_email
    ? linkQuery.eq("auth_login_email", partner.auth_login_email)
    : linkQuery.is("auth_login_email", null);
  if (partner.status) linkQuery = linkQuery.eq("status", partner.status);
  const { data: linkedPartner, error: linkError } = await linkQuery
    .maybeSingle();

  if (linkError) {
    const retryableConflict = ["40001", "40P01"].includes(linkError.code);
    const status = retryableConflict || ["23505", "23514"].includes(
        linkError.code,
      )
      ? 409
      : 500;
    logPortalHandlerFailure(ACTION, "link-professor", linkError);
    return identityFailure(
      context,
      retryableConflict
        ? "O vínculo de acesso mudou durante a operação. Atualize os dados e tente novamente."
        : status === 409
        ? "Esta identidade de acesso já pertence a outro parceiro incompatível."
        : "Não foi possível vincular o acesso institucional ao professor.",
      status,
    );
  }
  if (!linkedPartner) {
    return identityFailure(
      context,
      "O vínculo de acesso mudou durante a operação. Atualize o cadastro e tente novamente.",
      409,
    );
  }

  const institutionalAccessPending =
    linkedPartner.primeiro_acesso_institucional_pendente === true;

  return context.json({
    success: true,
    action: ACTION,
    userId: authUser.id,
    profileLinked: true,
    profileLinkState: "linked",
    institutionalAccessPending,
    message: institutionalAccessPending
      ? "O perfil de Professor foi vinculado, mas o acesso institucional permanece pendente até a pessoa concluir o primeiro acesso da identidade existente."
      : "O acesso existente também foi vinculado ao perfil de Professor. A senha atual foi preservada.",
  });
};

export const handleLinkProfessorAuthIdentity = async (
  context: HandlerContext,
  partner: Partner,
) => {
  try {
    return await linkProfessorAuthIdentity(context, partner);
  } catch (error) {
    logPortalHandlerFailure(ACTION, "unhandled", error);
    return identityFailure(
      context,
      "Não foi possível vincular o acesso institucional ao professor.",
      500,
    );
  }
};
