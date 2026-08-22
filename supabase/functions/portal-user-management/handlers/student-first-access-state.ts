import type { HandlerContext, Partner } from "../types.ts";

export const temporaryPasswordStillRequiresChange = (partner: Partner) => {
  if (!partner.senha_temporaria_pendente) return false;

  const issuedAt = Date.parse(partner.senha_temporaria_emitida_em || "");
  const passwordUpdatedAt = Date.parse(partner.senha_atualizada_em || "");
  return !Number.isFinite(issuedAt) || !Number.isFinite(passwordUpdatedAt) ||
    passwordUpdatedAt <= issuedAt;
};

export const getCurrentTermsVersion = async (context: HandlerContext) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_identidade_termos_versao_vigente",
    );
    const version = typeof data === "string" ? data.trim() : "";
    if (error || !version) {
      return {
        error: error?.message || "Não foi possível validar a versão dos termos.",
      };
    }
    return { version };
  } catch {
    return { error: "Não foi possível validar a versão dos termos." };
  }
};

export const hasCompletedStudentFirstAccess = (
  partner: Partner,
  currentTermsVersion: string,
) =>
  partner.acesso_status === "ativo" &&
  !partner.troca_senha_obrigatoria &&
  partner.aceitou_termos_uso === true &&
  partner.termos_uso_versao === currentTermsVersion &&
  !temporaryPasswordStillRequiresChange(partner);
