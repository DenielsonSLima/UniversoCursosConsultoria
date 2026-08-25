import { normalizeEmail } from "./auth-users.ts";
import type { Partner } from "./types.ts";

type IdentityProfile = Record<string, unknown>;
const IDENTITY_LOOKUP_ERROR =
  "Não foi possível validar os vínculos da identidade de acesso.";

export type AuthIdentityOwnershipResult = {
  error: string | null;
  conflict: string | null;
  hasCompatibleProfile: boolean;
};

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const profileCpf = (profile: IdentityProfile) =>
  onlyDigits(
    profile.cpf_cnpj ?? profile.cpf_normalizado ?? profile.cpf,
  );

const canonicalProfileEmail = (profile: IdentityProfile) =>
  normalizeEmail(String(profile.auth_login_email || "")) ||
  normalizeEmail(String(profile.email || ""));

const profileMatchesIdentity = (
  profile: IdentityProfile,
  expectedCpf: string,
  expectedEmail: string,
) => {
  const email = canonicalProfileEmail(profile);
  return profileCpf(profile) === expectedCpf && email === expectedEmail;
};

const ownershipError = (
  message: string,
): AuthIdentityOwnershipResult => ({
  error: message,
  conflict: null,
  hasCompatibleProfile: false,
});

const ownershipConflict = (
  message: string,
): AuthIdentityOwnershipResult => ({
  error: null,
  conflict: message,
  hasCompatibleProfile: false,
});

/**
 * Valida todos os perfis canônicos ligados ao UID antes de compartilhar Auth.
 * Metadados do Auth não participam da decisão: somente vínculos persistidos,
 * CPF e e-mail canônicos podem comprovar que os papéis são da mesma pessoa.
 */
export const findAuthIdentityConflict = async (
  admin: any,
  partner: Partner,
  authUserId: string,
): Promise<AuthIdentityOwnershipResult> => {
  const targetRole = String(partner.tipo || "").trim().toUpperCase();
  const oppositeRole = targetRole === "ALUNO"
    ? "PROFESSOR"
    : targetRole === "PROFESSOR"
    ? "ALUNO"
    : null;
  if (!oppositeRole) {
    return ownershipConflict(
      "Somente perfis de Aluno e Professor podem compartilhar esta identidade de acesso.",
    );
  }

  let partnerResult: any;
  let systemUserResult: any;
  let responsavelResult: any;
  try {
    [partnerResult, systemUserResult, responsavelResult] = await Promise.all([
      admin
        .from("parceiros")
        .select("id, tipo, cpf_cnpj, email, auth_login_email")
        .eq("auth_user_id", authUserId)
        .neq("id", partner.id)
        .limit(1000),
      admin
        .from("usuarios_sistema")
        .select("id, cpf, email")
        .eq("auth_user_id", authUserId)
        .limit(1000),
      admin
        .from("responsaveis_legais")
        .select("id, cpf_normalizado, email")
        .eq("auth_user_id", authUserId)
        .limit(1000),
    ]);
  } catch {
    return ownershipError(IDENTITY_LOOKUP_ERROR);
  }

  const queryError = partnerResult?.error || systemUserResult?.error ||
    responsavelResult?.error;
  if (queryError) {
    return ownershipError(IDENTITY_LOOKUP_ERROR);
  }

  const partnerProfiles = partnerResult?.data;
  const systemProfiles = systemUserResult?.data;
  const responsavelProfiles = responsavelResult?.data;
  if (
    !Array.isArray(partnerProfiles) || !Array.isArray(systemProfiles) ||
    !Array.isArray(responsavelProfiles)
  ) {
    return ownershipError(
      IDENTITY_LOOKUP_ERROR,
    );
  }

  const profileCount = partnerProfiles.length + systemProfiles.length +
    responsavelProfiles.length;
  if (profileCount === 0) {
    return { error: null, conflict: null, hasCompatibleProfile: false };
  }

  if (partnerProfiles.length > 1) {
    return ownershipConflict(
      "Esta identidade de acesso possui mais de um outro parceiro vinculado.",
    );
  }
  if (systemProfiles.length > 1) {
    return ownershipConflict(
      "Esta identidade de acesso possui mais de um usuário interno vinculado.",
    );
  }
  if (responsavelProfiles.length > 1) {
    return ownershipConflict(
      "Esta identidade de acesso possui mais de um responsável legal vinculado.",
    );
  }

  const otherPartner = partnerProfiles[0];
  if (otherPartner) {
    const otherRole = String(otherPartner.tipo || "").trim().toUpperCase();
    if (otherRole === targetRole) {
      return ownershipConflict(
        "Esta identidade de acesso já pertence a outro parceiro com o mesmo papel.",
      );
    }
    if (otherRole !== oppositeRole) {
      return ownershipConflict(
        "Esta identidade de acesso pertence a outro parceiro com papel incompatível.",
      );
    }
  }

  const targetCpf = onlyDigits(partner.cpf_cnpj);
  const targetEmail = canonicalProfileEmail(partner as IdentityProfile);
  if (targetCpf.length !== 11 || !targetEmail) {
    return ownershipConflict(
      "CPF e e-mail canônicos do parceiro são obrigatórios e devem coincidir para compartilhar o acesso.",
    );
  }

  if (
    otherPartner &&
    !profileMatchesIdentity(otherPartner, targetCpf, targetEmail)
  ) {
    return ownershipConflict(
      "O CPF ou e-mail do outro parceiro não confere com a identidade compartilhada.",
    );
  }
  if (
    systemProfiles.some((profile: IdentityProfile) =>
      !profileMatchesIdentity(profile, targetCpf, targetEmail)
    )
  ) {
    return ownershipConflict(
      targetRole === "PROFESSOR"
        ? "O CPF do professor não confere com o usuário interno existente ou o e-mail canônico diverge."
        : "O CPF ou e-mail do aluno não confere com o usuário interno existente.",
    );
  }
  if (
    responsavelProfiles.some((profile: IdentityProfile) =>
      !profileMatchesIdentity(profile, targetCpf, targetEmail)
    )
  ) {
    return ownershipConflict(
      "O CPF ou e-mail do responsável legal não confere com a identidade compartilhada.",
    );
  }

  return { error: null, conflict: null, hasCompatibleProfile: true };
};
