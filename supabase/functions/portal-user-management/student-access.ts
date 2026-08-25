export type StudentAccessStatus =
  | "sem_acesso"
  | "pendente"
  | "processando"
  | "convite_enviado"
  | "ativo"
  | "erro";

export type StudentAccessPatch = {
  auth_user_id?: string | null;
  auth_login_email?: string | null;
  troca_senha_obrigatoria?: boolean;
  acesso_status?: StudentAccessStatus;
  acesso_erro?: string | null;
  convite_enviado_em?: string | null;
  acesso_ativado_em?: string | null;
  senha_atualizada_em?: string | null;
};

const ACCESS_COLUMNS = new Set([
  "acesso_status",
  "acesso_erro",
  "convite_enviado_em",
  "acesso_ativado_em",
]);

const isMissingAccessColumnError = (error: any) => {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  if (code !== "PGRST204" && code !== "42703") return false;
  return Array.from(ACCESS_COLUMNS).some((column) => message.includes(column));
};

const legacyPatchFrom = (patch: StudentAccessPatch) => {
  const legacyPatch: StudentAccessPatch = {};
  if ("auth_user_id" in patch) legacyPatch.auth_user_id = patch.auth_user_id;
  if ("auth_login_email" in patch) {
    legacyPatch.auth_login_email = patch.auth_login_email;
  }
  if ("troca_senha_obrigatoria" in patch) {
    legacyPatch.troca_senha_obrigatoria = patch.troca_senha_obrigatoria;
  }
  if ("senha_atualizada_em" in patch) {
    legacyPatch.senha_atualizada_em = patch.senha_atualizada_em;
  }
  return legacyPatch;
};

/**
 * Persiste o estado canônico do acesso do aluno. Durante uma implantação em
 * duas etapas, mantém o vínculo Auth funcionando mesmo se a migration das
 * colunas de acompanhamento ainda não tiver chegado ao banco.
 */
export const updateStudentAccess = async (
  admin: any,
  partnerId: string,
  patch: StudentAccessPatch,
) => {
  try {
    const { error } = await admin.from("parceiros").update(patch).eq(
      "id",
      partnerId,
    );
    if (!error) return null;
    if (!isMissingAccessColumnError(error)) {
      return error.message || String(error);
    }

    const legacyPatch = legacyPatchFrom(patch);
    if (Object.keys(legacyPatch).length === 0) return null;

    const { error: legacyError } = await admin.from("parceiros").update(
      legacyPatch,
    ).eq("id", partnerId);
    return legacyError?.message || null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Falha inesperada ao atualizar o estado do acesso.";
  }
};

export const accessErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return (message || fallback).slice(0, 1000);
};

/** Resumo persistível: deliberadamente não replica PII, links ou tokens. */
export const accessErrorSummary = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("limite") || normalized.includes("rate limit")) {
    return "Limite temporário do serviço de autenticação. Tente novamente mais tarde.";
  }
  if (normalized.includes("redirect")) {
    return "Destino de primeiro acesso inválido ou não autorizado.";
  }
  if (
    normalized.includes("e-mail") || normalized.includes("email") ||
    normalized.includes("smtp")
  ) {
    return "Falha no preparo ou envio do e-mail de acesso.";
  }
  if (normalized.includes("outra identidade")) {
    return "Cadastro já vinculado a outra identidade de acesso.";
  }
  if (normalized.includes("outro cadastro")) {
    return "Identidade de acesso já vinculada a outro cadastro.";
  }
  return "Falha no provisionamento do acesso. Consulte os logs da função.";
};
