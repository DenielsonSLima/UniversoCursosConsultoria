import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
} from "../_shared/http.ts";

type Environment = "sandbox" | "production";
type ProviderCode = "mercado_pago" | "banese_card";

const normalizeEnvironment = (value: unknown): Environment =>
  value === "sandbox" ? "sandbox" : "production";

const providerFromPath = (req: Request): ProviderCode => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (last === "mercado_pago" || last === "banese_card") return last;
  throw new Error("Provedor bancario invalido para webhook.");
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

const resolveEventType = (payload: any) =>
  String(payload?.type || payload?.event || payload?.action || payload?.topic || "unknown");

const resolveRemotePaymentId = (payload: any) =>
  payload?.data?.id
  || payload?.payment?.id
  || payload?.payment_id
  || payload?.resource
  || null;

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

    const { error } = await admin
      .from("payment_gateway_webhook_events")
      .upsert({
        provider_code: providerCode,
        environment,
        event_id: eventId,
        event_type: resolveEventType(payload),
        remote_payment_id: resolveRemotePaymentId(payload),
        payload,
        processed: false,
        received_at: new Date().toISOString(),
      }, {
        onConflict: "provider_code,environment,event_id",
      });
    if (error) throw error;

    return new Response(JSON.stringify({ received: true }), {
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
