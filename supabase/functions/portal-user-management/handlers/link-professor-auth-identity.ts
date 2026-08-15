import { normalizeEmail } from "../auth-users.ts";
import { getGestorScope } from "../gestor-access.ts";
import { gestorHasModule } from "../permissions.ts";
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

/**
 * Vincula um Professor ao mesmo Auth de um usuário institucional existente.
 *
 * A operação é deliberadamente restrita a gestor global com Configurações e
 * exige e-mail e CPF coincidentes. O navegador nunca informa o auth_user_id.
 */
export const handleLinkProfessorAuthIdentity = async (
  context: HandlerContext,
  partner: Partner,
) => {
  if (partner.tipo !== "Professor") {
    return context.json({
      success: false,
      error:
        "Somente perfis de Professor podem receber este vínculo de acesso.",
    }, 400);
  }

  const scope = await getGestorScope(context.admin, context.gestor);
  if (!scope.global || !gestorHasModule(context.gestor, "configuracoes")) {
    // O cadastro de professor continua disponível para gestores do polo, mas
    // somente a administração global pode unir duas identidades de acesso.
    return noProfileLink(
      context,
      "requires_global_configuration_access",
      "O cadastro foi salvo. Se esta pessoa também for Gestor, um gestor global com acesso a Configurações deve concluir o vínculo.",
    );
  }

  if (partner.auth_user_id) return noProfileLink(context, "already_linked");

  const email = normalizeEmail(partner.auth_login_email || partner.email);
  if (!email) return noProfileLink(context, "not_eligible");

  const professorCpf = onlyDigits(partner.cpf_cnpj);
  if (!professorCpf) {
    return context.json({
      success: false,
      error:
        "Informe o CPF do professor antes de vincular o acesso institucional.",
    }, 409);
  }

  const { data: systemUserCandidates, error: systemUserError } = await context
    .admin
    .from("usuarios_sistema")
    .select("id, email, auth_user_id, cpf")
    .ilike("email", email)
    .limit(2);

  if (systemUserError) {
    return context.json({
      success: false,
      error: "Não foi possível verificar o perfil institucional existente.",
    }, 500);
  }

  const systemUser = (systemUserCandidates || []).find((candidate: any) =>
    normalizeEmail(candidate?.email) === email
  );
  if (!systemUser) return noProfileLink(context, "no_matching_gestor");

  if (!systemUser.auth_user_id) {
    return context.json({
      success: false,
      error: "Não foi possível verificar o perfil institucional existente.",
    }, 409);
  }

  const systemUserCpf = onlyDigits(systemUser.cpf);
  if (!systemUserCpf || systemUserCpf !== professorCpf) {
    return context.json({
      success: false,
      error:
        "O CPF do professor não confere com o usuário institucional existente.",
    }, 409);
  }

  const { data: authData, error: authError } = await context.admin.auth.admin
    .getUserById(systemUser.auth_user_id);
  if (authError) {
    return context.json({
      success: false,
      error: "Não foi possível verificar a identidade de acesso do professor.",
    }, 500);
  }

  const authUser = authData?.user;
  if (!authUser?.id) {
    return context.json({
      success: false,
      error:
        "A identidade de acesso do usuário institucional não está mais disponível.",
    }, 409);
  }

  if (normalizeEmail(authUser.email) !== email) {
    return context.json({
      success: false,
      error:
        "O e-mail do professor não confere com a identidade de acesso institucional.",
    }, 409);
  }

  const { data: otherPartner, error: otherPartnerError } = await context.admin
    .from("parceiros")
    .select("id")
    .eq("auth_user_id", authUser.id)
    .neq("id", partner.id)
    .limit(1);

  if (otherPartnerError) {
    return context.json({
      success: false,
      error: "Não foi possível validar os vínculos de acesso existentes.",
    }, 500);
  }

  if (otherPartner?.length) {
    return context.json({
      success: false,
      error: "Esta identidade de acesso já pertence a outro parceiro.",
    }, 409);
  }

  const { data: linkedPartner, error: linkError } = await context.admin
    .from("parceiros")
    .update({ auth_user_id: authUser.id })
    .eq("id", partner.id)
    .is("auth_user_id", null)
    .select("id, auth_user_id")
    .maybeSingle();

  if (linkError) {
    const status = linkError.code === "23505" ? 409 : 500;
    return context.json({
      success: false,
      error: status === 409
        ? "Esta identidade de acesso já pertence a outro parceiro."
        : "Não foi possível vincular o acesso institucional ao professor.",
    }, status);
  }

  if (!linkedPartner) {
    return context.json({
      success: false,
      error:
        "O vínculo de acesso mudou durante a operação. Atualize o cadastro e tente novamente.",
    }, 409);
  }

  return context.json({
    success: true,
    action: ACTION,
    profileLinked: true,
    profileLinkState: "linked",
    message: "O acesso existente também foi vinculado ao perfil de Professor.",
  });
};
