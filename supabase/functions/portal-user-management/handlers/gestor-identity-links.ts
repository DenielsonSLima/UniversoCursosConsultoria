import { normalizeEmail } from "../auth-users.ts";
import { logPortalHandlerFailure } from "./handler-error-log.ts";

const IDENTITY_LOOKUP_ERROR =
  "Não foi possível validar os vínculos da identidade de acesso.";

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const matchesIdentity = (
  profile: Record<string, unknown>,
  expectedCpf: string,
  expectedEmail: string,
) => {
  const cpf = onlyDigits(
    profile.cpf_cnpj ?? profile.cpf_normalizado ?? profile.cpf,
  );
  const email = normalizeEmail(profile.auth_login_email as string | null) ||
    normalizeEmail(profile.email as string | null);
  return cpf === expectedCpf && email === expectedEmail;
};

export const findGestorIdentityConflict = async (
  admin: any,
  authUserId: string,
  cpfValue: unknown,
  emailValue: unknown,
) => {
  const expectedCpf = onlyDigits(cpfValue);
  const expectedEmail = normalizeEmail(String(emailValue || ""));
  let partnerResult: any;
  let systemUserResult: any;
  let responsavelResult: any;

  try {
    [partnerResult, systemUserResult, responsavelResult] = await Promise.all([
      admin
        .from("parceiros")
        .select("id, tipo, cpf_cnpj, email, auth_login_email")
        .eq("auth_user_id", authUserId)
        .limit(10),
      admin
        .from("usuarios_sistema")
        .select("id, cpf, email")
        .eq("auth_user_id", authUserId)
        .limit(10),
      admin
        .from("responsaveis_legais")
        .select("id, cpf_normalizado, email")
        .eq("auth_user_id", authUserId)
        .limit(10),
    ]);
  } catch (error) {
    logPortalHandlerFailure(
      "upsert-gestor-user",
      "load-linked-identities",
      error,
    );
    return {
      error: IDENTITY_LOOKUP_ERROR,
      conflict: null,
      reusableIdentity: false,
    };
  }

  const queryError = partnerResult.error || systemUserResult.error ||
    responsavelResult.error;
  if (queryError) {
    logPortalHandlerFailure(
      "upsert-gestor-user",
      "load-linked-identities",
      queryError,
    );
    return {
      error: IDENTITY_LOOKUP_ERROR,
      conflict: null,
      reusableIdentity: false,
    };
  }

  if (systemUserResult.data?.length) {
    return {
      error: null,
      conflict:
        "Já existe um usuário interno vinculado a este e-mail. Edite o cadastro existente.",
      reusableIdentity: false,
    };
  }

  const compatibleProfiles = [
    ...(partnerResult.data || []),
    ...(responsavelResult.data || []),
  ] as Array<Record<string, unknown>>;
  if (!compatibleProfiles.length) {
    return { error: null, conflict: null, reusableIdentity: false };
  }

  if (
    !expectedCpf || !expectedEmail ||
    compatibleProfiles.some((profile) =>
      !matchesIdentity(profile, expectedCpf, expectedEmail)
    )
  ) {
    return {
      error: null,
      conflict:
        "O e-mail já pertence a outro perfil, mas o CPF informado não confere ou o e-mail canônico diverge em algum cadastro vinculado.",
      reusableIdentity: false,
    };
  }

  return { error: null, conflict: null, reusableIdentity: true };
};
