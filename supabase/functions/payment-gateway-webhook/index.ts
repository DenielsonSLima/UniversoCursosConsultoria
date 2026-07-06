import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
} from "../_shared/http.ts";
import { processGatewayWebhook } from "./providers/index.ts";
import type { GatewayEnvironment, GatewayProviderCode } from "./types.ts";

const normalizeEnvironment = (value: unknown): GatewayEnvironment =>
  value === "sandbox" ? "sandbox" : "production";

const providerFromPath = (req: Request): GatewayProviderCode => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (last === "mercado_pago" || last === "banese_card") return last;
  throw new Error("Provedor bancario invalido para webhook.");
};

const normalizeRemotePaymentId = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const paymentPathMatch = text.match(/\/payments?\/([^/?#]+)/i);
    if (paymentPathMatch?.[1]) return decodeURIComponent(paymentPathMatch[1]);
    const urlLikeMatch = text.match(/(?:^|[?&])id=([^&#]+)/i);
    if (urlLikeMatch?.[1]) return decodeURIComponent(urlLikeMatch[1]);
    const pathParts = text.split(/[/?#]/).filter(Boolean);
    if (/^https?:\/\//i.test(text) && pathParts.length) {
      return decodeURIComponent(pathParts[pathParts.length - 1]);
    }
    return text;
  }
  return null;
};

const resolveEventId = (payload: any, req: Request) =>
  String(
    payload?.id
    || payload?.event_id
    || payload?.data?.id
    || payload?.payment?.id
    || req.headers.get("x-request-id")
    || crypto.randomUUID()
  );

const resolveEventType = (payload: any, req: Request) => {
  const url = new URL(req.url);
  return String(
    payload?.type ||
      payload?.event ||
      payload?.action ||
      payload?.topic ||
      url.searchParams.get("type") ||
      url.searchParams.get("topic") ||
      "unknown",
  );
};

const resolveRemotePaymentId = (payload: any, req: Request) => {
  const url = new URL(req.url);
  return normalizeRemotePaymentId(
    url.searchParams.get("data.id"),
    url.searchParams.get("id"),
    payload?.data?.id,
    payload?.payment?.id,
    payload?.payment_id,
    payload?.resource,
  );
};

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);

  if (isRateLimitExceeded(`payment-gateway-webhook:${getClientIp(req)}`, 240, 60000)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersForRequest });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const url = new URL(req.url);
    const providerCode = providerFromPath(req);
    const environment = normalizeEnvironment(url.searchParams.get("environment"));
    const payload = await req.json().catch(() => ({}));
    const eventId = resolveEventId(payload, req);
    const remotePaymentId = resolveRemotePaymentId(payload, req);

    const { error } = await admin
      .from("payment_gateway_webhook_events")
      .upsert({
        provider_code: providerCode,
        environment,
        event_id: eventId,
        event_type: resolveEventType(payload, req),
        remote_payment_id: remotePaymentId,
        payload,
        processed: false,
        processing_error: null,
        received_at: new Date().toISOString(),
      }, {
        onConflict: "provider_code,environment,event_id",
      });
    if (error) throw error;

    let processResult;
    try {
      processResult = await processGatewayWebhook({
        admin,
        supabaseUrl,
        providerCode,
        environment,
        eventId,
        payload,
        remotePaymentId,
      });
    } catch (processError) {
      await admin
        .from("payment_gateway_webhook_events")
        .update({
          processed: false,
          processing_error: processError instanceof Error
            ? processError.message
            : String(processError),
          processed_at: new Date().toISOString(),
        })
        .eq("provider_code", providerCode)
        .eq("environment", environment)
        .eq("event_id", eventId);
      throw processError;
    }

    await admin
      .from("payment_gateway_webhook_events")
      .update({
        processed: true,
        processing_error: null,
        processed_at: new Date().toISOString(),
      })
      .eq("provider_code", providerCode)
      .eq("environment", environment)
      .eq("event_id", eventId);

    return new Response(JSON.stringify({ received: true, ...processResult }), {
      status: 200,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro no webhook bancario:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }), {
      status: 400,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" },
    });
  }
});
