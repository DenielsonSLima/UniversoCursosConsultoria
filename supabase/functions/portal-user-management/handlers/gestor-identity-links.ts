export const findGestorIdentityConflict = async (
  admin: any,
  authUserId: string,
) => {
  let partnerResult: any;
  let systemUserResult: any;
  try {
    [partnerResult, systemUserResult] = await Promise.all([
      admin
        .from("parceiros")
        .select("id, cpf_cnpj, email")
        .eq("auth_user_id", authUserId)
        .limit(1),
      admin
        .from("usuarios_sistema")
        .select("id")
        .eq("auth_user_id", authUserId)
        .limit(1),
    ]);
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : "Não foi possível validar os vínculos da identidade de acesso.",
      conflict: null,
      partner: null,
    };
  }

  const queryError = partnerResult.error || systemUserResult.error;
  if (queryError) {
    return {
      error: queryError.message ||
        "Não foi possível validar os vínculos da identidade de acesso.",
      conflict: null,
      partner: null,
    };
  }

  if (partnerResult.data?.length) {
    return {
      error: null,
      conflict:
        "Este e-mail já está vinculado ao acesso de um aluno ou professor.",
      partner: partnerResult.data[0],
    };
  }

  if (systemUserResult.data?.length) {
    return {
      error: null,
      conflict:
        "Já existe um usuário interno vinculado a este e-mail. Edite o cadastro existente.",
      partner: null,
    };
  }

  return { error: null, conflict: null, partner: null };
};
