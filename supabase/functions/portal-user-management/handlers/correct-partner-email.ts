import { normalizeEmail } from "../auth-users.ts";
import { isUuid } from "../permissions.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import type { HandlerContext, Partner, PublicApiKeyResolution } from "../types.ts";
import { deliverCorrectedPartnerEmail, type CorrectedEmailDelivery } from "./correct-partner-email-delivery.ts";

export interface CorrectPartnerEmailOptions {
  requestId: string;
  email: string;
  expectedEmail: string | null;
  expectedAuthUserId: string;
  expectedAuthEmail: string;
  redirectTo?: string;
  supabaseUrl: string;
  publicApiKey: PublicApiKeyResolution;
  deliver?: (email: string, redirectTo: string) => Promise<CorrectedEmailDelivery>;
}
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const errorStatus = (error: unknown) => {
  const code = record(error).code;
  return code === "42501" ? 403 : code === "22023" ? 400
    : ["40001", "55P03", "23505", "23514", "55000"].includes(String(code)) ? 409 : 500;
};

/** Correct only an existing, unused first-access identity; the RPC owns every authorization and identity guard. */
export async function handleCorrectPartnerEmail(
  context: HandlerContext,
  partner: Partner,
  options: CorrectPartnerEmailOptions,
) {
  const { admin, json } = context;
  const actor = String(context.gestor?.auth_user_id || "");
  const email = normalizeEmail(options.email);
  if (!isUuid(actor) || !isUuid(partner.id) || !isUuid(options.requestId)
    || !isUuid(options.expectedAuthUserId) || !["Aluno", "Professor"].includes(partner.tipo)
    || email.length > 254 || !emailPattern.test(email) || email.endsWith("@acesso.universocc.invalid")
    || !normalizeEmail(options.expectedAuthEmail)) {
    return json({ success: false, error: "A correção exige uma identidade vinculada e um e-mail real válido." }, 400);
  }
  const institutional = partner.tipo === "Professor";
  const redirect = resolveRedirectTarget(options.redirectTo || "/recuperar-senha");
  if (!redirect.redirectTo) return json({ success: false, error: "O destino do primeiro acesso não é permitido." }, 400);
  // The caller may select an allowed origin, never another profile's recovery audience.
  const destination = new URL(redirect.redirectTo);
  destination.pathname = "/recuperar-senha";
  destination.search = institutional ? "?source=institucional" : "?source=aluno";
  destination.hash = "";
  const base = { p_actor_auth_user_id: actor, p_partner_id: partner.id, p_request_id: options.requestId };
  let corrected: Record<string, unknown>;
  try {
    const result = await admin.rpc("portal_correct_partner_email_internal", {
      ...base,
      p_email: email,
      p_expected_email: normalizeEmail(options.expectedEmail) || null,
      p_expected_auth_user_id: options.expectedAuthUserId,
      p_expected_auth_email: normalizeEmail(options.expectedAuthEmail),
    });
    if (result.error) return json({ success: false, code: "PARTNER_EMAIL_CORRECTION_REVIEW_REQUIRED",
      error: "A identidade ou a elegibilidade mudou. Atualize o cadastro antes de corrigir o e-mail de acesso." }, errorStatus(result.error));
    corrected = record(result.data);
  } catch {
    return json({ success: false, error: "Não foi possível confirmar a correção do e-mail. Atualize o cadastro antes de repetir." }, 500);
  }
  const canonical = corrected.userId === options.expectedAuthUserId && corrected.email === email
    && corrected.emailCorrected === true && corrected.loginEmailChanged === true;
  if (!canonical) return json({ success: false, error: "A correção não retornou uma identidade canônica válida." }, 500);
  const response = {
    success: true,
    action: "correct-partner-email",
    userId: options.expectedAuthUserId,
    email,
    emailCorrected: true,
    loginEmailChanged: true,
    emailSent: false,
    deliveryPending: true,
  };
  if (corrected.emailSent === true) return json({ ...response, emailSent: true, deliveryPending: false,
    message: "O e-mail já foi corrigido e o link de primeiro acesso já foi enviado nesta solicitação." });
  if (!options.publicApiKey.apiKey) return json({ ...response,
    message: "O e-mail foi corrigido. O envio do primeiro acesso permanece pendente de configuração do serviço." });
  let claim: Record<string, unknown>;
  try {
    const result = await admin.rpc("portal_partner_email_correction_delivery_internal", { ...base, p_action: "CLAIM" });
    if (result.error) return json({ ...response, code: "PARTNER_EMAIL_CORRECTION_DELIVERY_PENDING",
      message: "O e-mail foi corrigido, mas o envio depende de uma nova conferência do vínculo de acesso." });
    claim = record(result.data);
  } catch {
    return json({ ...response, message: "O e-mail foi corrigido. O envio do primeiro acesso ainda não foi confirmado." });
  }
  if (claim.claimed !== true) return json({ ...response, emailSent: claim.emailSent === true,
    deliveryPending: claim.deliveryPending !== false,
    ...(Number.isInteger(claim.retryAfterSeconds) ? { retryAfterSeconds: claim.retryAfterSeconds as number } : {}),
    message: claim.emailSent === true ? "O link de primeiro acesso já foi enviado nesta solicitação."
      : "O e-mail foi corrigido. O envio está em andamento ou aguardando o prazo seguro para nova tentativa." });
  if (claim.userId !== options.expectedAuthUserId || claim.email !== email || !isUuid(String(claim.deliveryNonce))) {
    return json({ ...response, code: "PARTNER_EMAIL_CORRECTION_DELIVERY_PENDING",
      message: "O e-mail foi corrigido, mas o vínculo mudou antes do envio. Nenhum novo link foi solicitado." });
  }
  const send = options.deliver ?? ((address, destination) => deliverCorrectedPartnerEmail(
    options.supabaseUrl, options.publicApiKey.apiKey!, address, destination,
  ));
  let delivery: CorrectedEmailDelivery;
  try { delivery = await send(email, destination.toString()); }
  catch { delivery = { sent: false, definitiveFailure: false }; }
  let finalized = false;
  try {
    const result = await admin.rpc("portal_partner_email_correction_delivery_internal", {
      ...base, p_action: "FINISH", p_delivery_nonce: claim.deliveryNonce,
      p_sent: delivery.sent, p_definitive_failure: delivery.definitiveFailure,
    });
    finalized = !result.error && record(result.data).emailSent === delivery.sent;
  } catch { /* The bounded delivery lease supports a later authorized reconciliation/retry. */ }
  return json({ ...response, emailSent: delivery.sent, deliveryPending: !delivery.sent || !finalized,
    ...(!delivery.sent ? { retryAfterSeconds: 120 } : {}),
    message: delivery.sent
      ? finalized ? "O e-mail foi corrigido e o serviço aceitou o envio do link de primeiro acesso ao novo endereço."
        : "O serviço aceitou o envio ao novo endereço; a confirmação do registro da entrega continua pendente."
      : "O e-mail foi corrigido. O envio do link não foi confirmado; aguarde o prazo antes de tentar novamente.",
  });
}
