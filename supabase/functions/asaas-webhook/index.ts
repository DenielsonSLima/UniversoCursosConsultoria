import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { baseUrlFor, createCallAsaas } from "./asaas-http.ts";
import { createAsaasWebhookHandlers } from "./handlers.service.ts";
import {
  isPaymentConfirmedEvent,
  json,
  localStatusForPaymentEvent,
} from "./shared.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let eventId = "";
  try {
    const receivedToken = req.headers.get("asaas-access-token");
    const getSecret = async (name: string) => {
      const { data, error } = await admin.rpc("asaas_get_secret", { p_secret_name: name });
      if (error) throw error;
      return data as string | null;
    };
    const sandboxToken = await getSecret("asaas_sandbox_webhook_token") || await getSecret("asaas_webhook_token");
    const productionToken = await getSecret("asaas_production_webhook_token");
    const environment = receivedToken && productionToken && receivedToken === productionToken
      ? "production"
      : receivedToken && sandboxToken && receivedToken === sandboxToken
        ? "sandbox"
        : null;
    if (!environment) return json({ error: "Token inválido." }, 401);

    const payload = await req.json();
    eventId = String(payload.id || crypto.randomUUID());
    const eventType = String(payload.event || "");
    let payment = payload.payment || {};

    const apiKey = await getSecret(
      environment === "production" ? "asaas_production_api_key" : "asaas_sandbox_api_key",
    );
    if (!apiKey) throw new Error(`Chave do ambiente ${environment} não configurada.`);
    const callAsaas = createCallAsaas({ apiKey, environment, baseUrl: baseUrlFor(environment) });
    const handlers = createAsaasWebhookHandlers(admin, callAsaas);

    const { error: insertError } = await admin.from("asaas_webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      payment_id: payment.id || null,
      payload,
    });
    if (insertError?.code === "23505") {
      const { data: existingEvent, error: existingError } = await admin
        .from("asaas_webhook_events")
        .select("processed")
        .eq("event_id", eventId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingEvent?.processed === true) {
        return json({ received: true, duplicate: true });
      }
      const { error: retryUpdateError } = await admin
        .from("asaas_webhook_events")
        .update({
          event_type: eventType,
          payment_id: payment.id || null,
          payload,
          processed: false,
          processing_error: null,
          received_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);
      if (retryUpdateError) throw retryUpdateError;
    }
    if (insertError && insertError.code !== "23505") throw insertError;

    if (
      payment?.id
      && ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_DELETED"].includes(eventType)
    ) {
      try {
        const remotePayment = await callAsaas(`/payments/${payment.id}`);
        payment = { ...payment, ...remotePayment };
      } catch (verifyError) {
        if (eventType !== "PAYMENT_DELETED") throw verifyError;
      }
    }

    const isPaymentConfirmed = isPaymentConfirmedEvent(eventType, payment);
    const localStatus = localStatusForPaymentEvent(eventType, isPaymentConfirmed);

    await handlers.handleReceivablePayment(payment, eventType, localStatus);
    await handlers.handlePaymentLinkPayment(payment, eventType, localStatus, isPaymentConfirmed);

    await admin.from("asaas_webhook_events").update({
      processed: true,
      processing_error: null,
      processed_at: new Date().toISOString(),
    }).eq("event_id", eventId);
    return json({ received: true });
  } catch (error) {
    console.error(error);
    if (eventId) {
      await admin.from("asaas_webhook_events").update({
        processed: false,
        processing_error: error instanceof Error ? error.message : String(error),
        processed_at: new Date().toISOString(),
      }).eq("event_id", eventId);
    }
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
