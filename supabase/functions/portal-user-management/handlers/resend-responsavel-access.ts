import { sendRecoveryEmail } from "../auth-users.ts";
import { isUuid } from "../permissions.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import type { HandlerContext } from "../types.ts";
import {
  loadPreparedResponsavelAccess,
  resolveCanonicalResponsavelIdentity,
  respondResponsavelAccessFailure,
} from "./responsavel-access-context.ts";

const ACTION = "resend-responsavel-access";

type ResendResponsavelAccessOptions = {
  supabaseUrl: string;
  publicApiKey: string | null;
};

type ResendReservation = {
  shouldSend: boolean;
  replayed: boolean;
  state: "reserved" | "sent";
};

const resendRpcArgs = (
  responsavelLegalId: string,
  requestId: string,
  actorAuthUserId: string,
) => ({
  p_responsavel_legal_id: responsavelLegalId,
  p_request_id: requestId,
  p_actor_auth_user_id: actorAuthUserId,
});

const reserveResend = async (
  context: HandlerContext,
  responsavelLegalId: string,
  requestId: string,
  actorAuthUserId: string,
): Promise<ResendReservation | null> => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_reservar_reenvio_acesso_responsavel",
      resendRpcArgs(responsavelLegalId, requestId, actorAuthUserId),
    );
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    const source = data as Record<string, unknown>;
    const state = String(source.state || "").trim().toLowerCase();
    if (
      typeof source.shouldSend !== "boolean" ||
      typeof source.replayed !== "boolean" ||
      (state !== "reserved" && state !== "sent")
    ) {
      return null;
    }
    return {
      shouldSend: source.shouldSend,
      replayed: source.replayed,
      state,
    };
  } catch {
    return null;
  }
};

const finishResendReservation = async (
  context: HandlerContext,
  rpcName:
    | "portal_concluir_reenvio_acesso_responsavel"
    | "portal_cancelar_reenvio_acesso_responsavel",
  responsavelLegalId: string,
  requestId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      rpcName,
      resendRpcArgs(responsavelLegalId, requestId, actorAuthUserId),
    );
    if (error) return false;
    if (data === true) return true;
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const source = data as Record<string, unknown>;
    return source.completed === true || source.cancelled === true;
  } catch {
    return false;
  }
};

const replayResponse = (
  context: HandlerContext,
  identityUserId: string,
  state: ResendReservation["state"],
) =>
  context.json({
    success: true,
    action: ACTION,
    userId: identityUserId,
    recoveryEmailSent: state === "sent",
    requestFinalized: state === "sent",
    profileLinkState: "already_linked",
    message: state === "sent"
      ? "Este pedido de reenvio já foi concluído. Nenhum e-mail duplicado foi enviado."
      : "Este pedido de reenvio já está em processamento. Nenhum e-mail duplicado foi enviado.",
  }, state === "sent" ? 200 : 202);

export const handleResendResponsavelAccess = async (
  context: HandlerContext,
  responsavelLegalIdValue: unknown,
  requestIdValue: unknown,
  options: ResendResponsavelAccessOptions,
) => {
  const responsavelLegalId = String(responsavelLegalIdValue || "").trim();
  if (!isUuid(responsavelLegalId)) {
    return context.json({
      success: false,
      error: "responsavelLegalId válido é obrigatório.",
    }, 400);
  }
  const requestId = String(requestIdValue || "").trim();
  if (!isUuid(requestId)) {
    return context.json({
      success: false,
      error: "requestId UUID estável é obrigatório.",
    }, 400);
  }

  const prepared = await loadPreparedResponsavelAccess(
    context,
    responsavelLegalId,
  );
  if ("failure" in prepared) {
    return respondResponsavelAccessFailure(context, prepared);
  }
  const identity = await resolveCanonicalResponsavelIdentity(context, prepared);
  if ("failure" in identity) {
    return respondResponsavelAccessFailure(context, identity);
  }

  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  if (!isUuid(actorAuthUserId)) {
    return context.json({
      success: false,
      error: "A identidade do gestor não pôde ser confirmada.",
    }, 401);
  }

  const redirectResolution = resolveRedirectTarget(
    "/recuperar-senha?source=responsavel",
  );
  if (!redirectResolution.redirectTo) {
    return context.json({
      success: false,
      error: "Não foi possível preparar o link de recuperação do responsável.",
    }, redirectResolution.status);
  }

  const reservation = await reserveResend(
    context,
    responsavelLegalId,
    requestId,
    actorAuthUserId,
  );
  if (!reservation) {
    return context.json({
      success: false,
      error: "Não foi possível reservar o reenvio de acesso.",
    }, 500);
  }
  if (!reservation.shouldSend) {
    return replayResponse(context, identity.authUser.id, reservation.state);
  }

  const recovery = await sendRecoveryEmail(
    options.supabaseUrl,
    options.publicApiKey,
    identity.email,
    redirectResolution.redirectTo,
  );
  if (!recovery.sent) {
    if (recovery.definitiveFailure) {
      await finishResendReservation(
        context,
        "portal_cancelar_reenvio_acesso_responsavel",
        responsavelLegalId,
        requestId,
        actorAuthUserId,
      );
    }
    return context.json({
      success: false,
      requestFinalized: false,
      error: recovery.definitiveFailure
        ? "Não foi possível enviar o novo e-mail de acesso. O pedido pode ser tentado novamente."
        : "O provedor não confirmou o envio. Reutilize este mesmo pedido para consultar o estado sem duplicar o e-mail.",
    }, 502);
  }

  const completed = await finishResendReservation(
    context,
    "portal_concluir_reenvio_acesso_responsavel",
    responsavelLegalId,
    requestId,
    actorAuthUserId,
  );
  if (!completed) {
    return context.json({
      success: true,
      action: ACTION,
      userId: identity.authUser.id,
      recoveryEmailSent: true,
      requestFinalized: false,
      profileLinkState: "already_linked",
      message:
        "O e-mail foi solicitado, mas a confirmação do reenvio ainda está sendo conciliada. Reutilize este mesmo pedido para não duplicar o envio.",
    }, 202);
  }

  return context.json({
    success: true,
    action: ACTION,
    userId: identity.authUser.id,
    recoveryEmailSent: true,
    requestFinalized: true,
    profileLinkState: "already_linked",
    message:
      "Novo e-mail de acesso enviado. O responsável poderá criar uma senha pela recuperação.",
  });
};
