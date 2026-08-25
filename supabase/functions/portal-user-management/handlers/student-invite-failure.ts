import { accessErrorSummary, updateStudentAccess } from "../student-access.ts";
import type { HandlerContext, Partner } from "../types.ts";
import { logPortalHandlerFailure } from "./handler-error-log.ts";

const ACTION = "send-student-invite";
const INTERNAL_FAILURE_MESSAGES = {
  "mark-processing": "Não foi possível atualizar o estado do acesso do aluno.",
  "get-auth-user":
    "Não foi possível verificar a identidade de acesso do aluno.",
  "find-auth-user":
    "Não foi possível localizar a identidade de acesso do aluno.",
  "build-invite-proof":
    "A configuração segura de reconciliação do convite está indisponível.",
  "invite-auth-user": "Não foi possível enviar o convite de acesso do aluno.",
  "validate-returned-invite-proof":
    "Não foi possível validar a prova segura do convite do aluno.",
  "requery-invited-auth-user":
    "Não foi possível confirmar a identidade criada durante o convite.",
  "invite-auth-user-result":
    "Não foi possível confirmar o convite de acesso do aluno.",
  "create-synthetic-auth-user":
    "Não foi possível criar a identidade de acesso por matrícula.",
  "requery-synthetic-auth-user":
    "Não foi possível confirmar a identidade de acesso por matrícula.",
  "create-synthetic-auth-user-result":
    "Não foi possível confirmar o acesso por matrícula.",
  "validate-existing-invite-proof":
    "Não foi possível validar a prova segura do convite anterior do aluno.",
  "update-linked-student":
    "Não foi possível atualizar o vínculo de acesso do aluno.",
  "mark-recovery-sent":
    "Não foi possível atualizar o envio do acesso do aluno.",
  "generate-recovery-link":
    "Não foi possível gerar o link de primeiro acesso do aluno.",
  "generate-recovery-link-result":
    "Não foi possível gerar o link de primeiro acesso do aluno.",
  "mark-access-pending":
    "Não foi possível atualizar o estado pendente do acesso do aluno.",
} as const;

type InternalFailurePhase = keyof typeof INTERNAL_FAILURE_MESSAGES;

export const createStudentInviteFailureResponder = (
  context: HandlerContext,
  partner: Partner,
  authEmail: string,
  accessWasActive: boolean,
) => {
  const failAccess = async (message: string, status = 500) => {
    await updateStudentAccess(context.admin, partner.id, {
      ...(authEmail ? { auth_login_email: authEmail } : {}),
      ...(!accessWasActive ? { acesso_status: "erro" as const } : {}),
      acesso_erro: accessErrorSummary(message),
    });
    return context.json({ success: false, error: message }, status);
  };

  const failInternal = (
    phase: InternalFailurePhase,
    error: unknown,
  ) => {
    logPortalHandlerFailure(ACTION, phase, error);
    return failAccess(INTERNAL_FAILURE_MESSAGES[phase], 500);
  };

  return { failAccess, failInternal };
};
