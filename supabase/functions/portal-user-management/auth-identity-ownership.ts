export const findAuthIdentityConflict = async (
  admin: any,
  partnerId: string,
  authUserId: string,
) => {
  try {
    const { data: partnerConflicts, error: partnerError } = await admin
      .from("parceiros")
      .select("id")
      .eq("auth_user_id", authUserId)
      .neq("id", partnerId)
      .limit(1);
    if (partnerError) {
      return {
        error: partnerError.message ||
          "Não foi possível validar os vínculos de alunos.",
        conflict: null,
      };
    }
    if (partnerConflicts?.length) {
      return {
        error: null,
        conflict: "Esta identidade de acesso já pertence a outro parceiro.",
      };
    }

    const { data: systemConflicts, error: systemError } = await admin
      .from("usuarios_sistema")
      .select("id")
      .eq("auth_user_id", authUserId)
      .limit(1);
    if (systemError) {
      return {
        error: systemError.message ||
          "Não foi possível validar os vínculos de gestores.",
        conflict: null,
      };
    }
    if (systemConflicts?.length) {
      return {
        error: null,
        conflict:
          "Esta identidade de acesso pertence a um usuário interno do sistema.",
      };
    }

    return { error: null, conflict: null };
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : "Falha inesperada ao validar a identidade de acesso.",
      conflict: null,
    };
  }
};
