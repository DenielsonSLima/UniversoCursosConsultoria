import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
} from "../../_shared/http.ts";
import { processGatewayWebhook } from "./providers/index.ts";
import type { GatewayEnvironment, GatewayProviderCode } from "./types.ts";

class WebhookAuthError extends Error {
  statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "WebhookAuthError";
  }
}

class WebhookUnsupportedError extends Error {
  statusCode = 501;

  constructor(message: string) {
    super(message);
    this.name = "WebhookUnsupportedError";
  }
}

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
    payload?.id ||
      payload?.event_id ||
      payload?.data?.id ||
      payload?.payment?.id ||
      req.headers.get("x-request-id") ||
      crypto.randomUUID(),
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

const parseMercadoPagoSignature = (header: string | null) => {
  const parsed = { ts: "", v1: "" };
  for (const part of String(header || "").split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") parsed.ts = value;
    if (key === "v1") parsed.v1 = value;
  }
  return parsed;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

const hmacSha256Hex = async (secret: string, value: string) => {
  const encoder = new globalThis.TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
};

const getWebhookSecret = async (
  admin: any,
  providerCode: GatewayProviderCode,
  environment: GatewayEnvironment,
) => {
  const { data, error } = await admin.rpc("payment_gateway_get_secret", {
    p_secret_name:
      `payment_gateway_${providerCode}_${environment}_webhook_secret`,
  });
  if (error) throw error;
  return String(data || "").trim();
};

const assertMercadoPagoSignature = async (
  admin: any,
  req: Request,
  environment: GatewayEnvironment,
) => {
  const secret = await getWebhookSecret(admin, "mercado_pago", environment);
  if (!secret) {
    throw new WebhookAuthError(
      "Webhook secret Mercado Pago nao configurado.",
    );
  }

  const { ts, v1 } = parseMercadoPagoSignature(
    req.headers.get("x-signature"),
  );
  if (!ts || !v1) {
    throw new WebhookAuthError("Assinatura Mercado Pago ausente.");
  }

  const url = new URL(req.url);
  const dataId = String(url.searchParams.get("data.id") || "").toLowerCase();
  const requestId = String(req.headers.get("x-request-id") || "").trim();
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);

  const computed = await hmacSha256Hex(secret, `${parts.join(";")};`);
  if (!timingSafeEqual(computed, v1.toLowerCase())) {
    throw new WebhookAuthError("Assinatura Mercado Pago invalida.");
  }
};

const assertWebhookSignature = async (
  admin: any,
  req: Request,
  providerCode: GatewayProviderCode,
  environment: GatewayEnvironment,
) => {
  if (providerCode === "mercado_pago") {
    await assertMercadoPagoSignature(admin, req, environment);
    return;
  }
  if (providerCode === "banese_card") {
    throw new WebhookUnsupportedError(
      "Webhook Banese ainda nao foi habilitado com autenticacao oficial; use conciliacao ativa do boleto.",
    );
  }
};

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);

  if (
    isRateLimitExceeded(
      `payment-gateway-webhook:${getClientIp(req)}`,
      240,
      60000,
    )
  ) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest });
  }
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
    const environment = normalizeEnvironment(
      url.searchParams.get("environment"),
    );
    await assertWebhookSignature(admin, req, providerCode, environment);

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
    const status = error instanceof WebhookAuthError ||
        error instanceof WebhookUnsupportedError
      ? error.statusCode
      : 400;
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "internal_error",
      }),
      {
        status,
        headers: {
          ...corsHeadersForRequest,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
