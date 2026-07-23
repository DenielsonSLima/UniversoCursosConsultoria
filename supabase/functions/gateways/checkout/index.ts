import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../../_shared/http.ts";
import type { CheckoutRuntime } from "./types.ts";
import { normalizeErrorMessage, providerLabelFor } from "./utils.ts";

const parseBody = (bodyText: string) => {
  try {
    return JSON.parse(bodyText || "{}");
  } catch {
    throw new Error("Payload invalido.");
  }
};

const preflightCorsHeaders = (req: Request) => {
  const requestOrigin = req.headers.get("origin");
  const allowedOrigin = requestOrigin || "https://universocc.com.br";
  const requestedHeaders = req.headers
    .get("access-control-request-headers")
    ?.split(/[,\s]+/)
    .map((header) => header.trim())
    .filter(Boolean)
    .join(", ")
    ?.toLowerCase();

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": requestedHeaders ||
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "text/plain;charset=UTF-8",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'self'; form-action 'self';",
    Vary: "Origin",
  };
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: preflightCorsHeaders(req),
    });
  }
  if (req.method !== "POST") {
    return json({ error: "Metodo nao permitido." }, 405, req);
  }

  if (isRateLimitExceeded(`payment-checkout:${getClientIp(req)}`, 30, 60000)) {
    return json(
      {
        error:
          "Muitas tentativas de pagamento. Tente novamente em alguns segundos.",
      },
      429,
      req,
    );
  }

  const bodyText = await req.text();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  try {
    const { buildEadCheckoutContext } = await import("./ead-context.ts");
    const runtime: CheckoutRuntime = {
      req,
      bodyText,
      body: parseBody(bodyText),
      admin,
      supabaseUrl,
      corsHeaders,
    };

    const resolvedContext = await buildEadCheckoutContext(runtime);
    if (!resolvedContext) {
      const { runCourseCheckout } = await import("./providers/course.ts");
      return runCourseCheckout(runtime);
    }

    const context = resolvedContext;

    const { handleGatewayCheckout } = await import("./providers/gateway.ts");
    const result = await handleGatewayCheckout(context);
    const checkoutReceivableId = result.receivableId || null;

    console.info("payment-checkout routed", {
      modalidade: "EAD",
      provider: context.route.providerCode,
      providerLabel: providerLabelFor(context.route.providerCode),
      method: context.charge.method,
      installments: context.charge.installmentCount,
      receivableId: checkoutReceivableId,
    });

    return json(result.response, 200, req);
  } catch (error) {
    const message = normalizeErrorMessage(error);
    console.error("Erro no payment-checkout:", error);

    // O checkout e idempotente pelo recebivel. Em falha, preservar matricula,
    // recebivel e eventual lock permite retry/recovery e impede que a requisicao
    // perdedora apague o estado de outra chamada concorrente.

    return json({ error: message }, 400, req);
  }
});
