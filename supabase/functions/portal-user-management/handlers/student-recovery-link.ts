export type StudentRecoveryResult = {
  data?: {
    user?: { id?: string | null } | null;
    properties?: { action_link?: string | null } | null;
  } | null;
  error?: { code?: string; message?: string } | null;
};

type RecoveryLinkValidation =
  | { link: string }
  | { error: string; status: number };

/** O Auth resolve por e-mail; o link precisa pertencer ao vínculo já verificado. */
export const validateStudentRecoveryLink = (
  result: StudentRecoveryResult,
  expectedAuthUserId: string,
): RecoveryLinkValidation => {
  if (!expectedAuthUserId || result.data?.user?.id !== expectedAuthUserId) {
    return {
      error: "A identidade de acesso mudou durante a recuperação. Atualize os dados e tente novamente.",
      status: 409,
    };
  }
  const link = result.data?.properties?.action_link;
  if (typeof link !== "string" || !link.trim()) {
    return {
      error: "Não foi possível gerar um link seguro de recuperação para o aluno.",
      status: 500,
    };
  }
  return { link };
};
