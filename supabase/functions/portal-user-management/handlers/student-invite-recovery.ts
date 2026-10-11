import { sendRecoveryEmail } from "../auth-users.ts";
import { accessErrorSummary } from "../student-access.ts";
import type { HandlerContext, PublicApiKeyResolution } from "../types.ts";
import type { StudentInviteState } from "./student-invite-state.ts";
import type { createStudentInviteFailureResponder } from "./student-invite-failure.ts";
import {
  type StudentRecoveryResult,
  validateStudentRecoveryLink,
} from "./student-recovery-link.ts";

type RecoveryOptions = {
  context: HandlerContext;
  state: StudentInviteState;
  authUserId: string;
  authEmail: string;
  canDeliverByEmail: boolean;
  passwordWasCreated: boolean;
  accessWasActive: boolean;
  finalRedirect: string;
  options: { supabaseUrl: string; publicApiKey: PublicApiKeyResolution };
  failure: ReturnType<typeof createStudentInviteFailureResponder>;
};

/** Checkpoint antes do despacho; CAS final antes da entrega manual ou do estado. */
export const handleStudentInviteRecovery = async (input: RecoveryOptions) => {
  const {
    context,
    state,
    authUserId,
    authEmail,
    canDeliverByEmail,
    passwordWasCreated,
    accessWasActive,
    finalRedirect,
    options,
  } = input;
  const { admin, json } = context;
  const { failAccess, failInternal } = input.failure;
  let deliveryError: string | null = null;
  if (canDeliverByEmail) {
    if (options.publicApiKey.apiKey) {
      const deliveryPermit = await state.check();
      if (deliveryPermit.error) {
        return failAccess(deliveryPermit.error, deliveryPermit.status);
      }
    }
    const emailDelivery = options.publicApiKey.apiKey
      ? await sendRecoveryEmail(
        options.supabaseUrl,
        options.publicApiKey.apiKey,
        authEmail,
        finalRedirect,
      )
      : { sent: false, message: options.publicApiKey.message };

    if (emailDelivery.sent) {
      state.markRecoveryEmailSent();
      const sentAt = new Date().toISOString();
      const sent = await state.write(
        passwordWasCreated
          ? {
            acesso_erro: null,
          }
          : {
            acesso_status: "convite_enviado",
            acesso_erro: null,
            convite_enviado_em: sentAt,
          },
      );
      if (sent.error) {
        return failInternal("mark-recovery-sent", sent.error);
      }

      return json({
        success: true,
        action: "recovery",
        userId: authUserId,
        inviteSent: false,
        recoveryEmailSent: true,
        recoveryLink: null,
        message: accessWasActive
          ? "O acesso do aluno já estava ativo. Enviamos um link para redefinir a senha, sem alterar o acesso atual."
          : passwordWasCreated
          ? "A senha já criada foi preservada. Enviamos um link de recuperação por e-mail."
          : "Já existia uma conta para este e-mail. Enviamos um link para concluir o acesso.",
      });
    }
    deliveryError = emailDelivery.message ||
      "Não foi possível enviar o link por e-mail.";
  }

  const linkPermit = await state.check();
  if (linkPermit.error) return failAccess(linkPermit.error, linkPermit.status);
  let recovery: StudentRecoveryResult;
  try {
    recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email: authEmail,
      options: { redirectTo: finalRedirect },
    });
  } catch (error) {
    return failInternal("generate-recovery-link", error);
  }
  if (recovery.error) {
    return failInternal("generate-recovery-link-result", recovery.error);
  }
  const recoveryLink = validateStudentRecoveryLink(recovery, authUserId);
  if ("error" in recoveryLink) {
    return json({
      success: false,
      error: recoveryLink.error,
      ...state.delivery(),
    }, recoveryLink.status);
  }

  const pending = await state.write(
    passwordWasCreated
      ? {
        acesso_erro: deliveryError ? accessErrorSummary(deliveryError) : null,
      }
      : {
        acesso_status: "pendente",
        acesso_erro: deliveryError ? accessErrorSummary(deliveryError) : null,
      },
  );
  if (pending.error) {
    return failInternal("mark-access-pending", pending.error);
  }

  return json({
    success: true,
    action: "recovery",
    userId: authUserId,
    inviteSent: false,
    recoveryEmailSent: false,
    recoveryLink: recoveryLink.link,
    message: accessWasActive
      ? "O acesso do aluno já estava ativo. Geramos apenas um link para redefinir a senha, sem alterar o acesso atual."
      : passwordWasCreated
      ? "A senha já criada foi preservada. Geramos um link de recuperação para envio manual."
      : canDeliverByEmail
      ? "Geramos um link seguro para envio manual por um canal previamente verificado."
      : "Aluno sem e-mail: envie o link seguro por um canal previamente verificado, como o WhatsApp cadastrado.",
  });
};
