import { normalizeEmail } from "../auth-users.ts";

export const GESTOR_USER_UNIQUENESS_RPC =
  "portal_validar_unicidade_usuario_sistema";

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

type GestorUserUniqueness = {
  email_em_uso?: boolean;
  cpf_em_uso?: boolean;
  email_usuario_nome?: string | null;
  cpf_usuario_nome?: string | null;
};

const conflictOwnerSuffix = (value?: string | null) => {
  const name = String(value || "").trim().slice(0, 120);
  return name ? ` (${name})` : "";
};

export const checkGestorUserUniqueness = async (
  admin: any,
  email: string,
  cpf: unknown,
) => {
  const { data, error } = await admin.rpc(GESTOR_USER_UNIQUENESS_RPC, {
    p_email: normalizeEmail(email),
    p_cpf: onlyDigits(cpf),
  });
  if (error) {
    return {
      error: "Não foi possível validar e-mail e CPF antes do envio do convite.",
      status: 500,
      code: "GESTOR_IDENTIDADE_PREFLIGHT_FALHOU",
    };
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | GestorUserUniqueness
    | null;
  if (result?.email_em_uso) {
    return {
      error: `Já existe um usuário interno com este e-mail${
        conflictOwnerSuffix(result.email_usuario_nome)
      }. Edite o cadastro existente. Nenhum convite foi enviado.`,
      status: 409,
      code: "GESTOR_EMAIL_JA_CADASTRADO",
    };
  }
  if (result?.cpf_em_uso) {
    return {
      error: `Já existe um usuário interno com este CPF${
        conflictOwnerSuffix(result.cpf_usuario_nome)
      }. Localize e edite o cadastro existente. Nenhum convite foi enviado.`,
      status: 409,
      code: "GESTOR_CPF_JA_CADASTRADO",
    };
  }
  return null;
};
