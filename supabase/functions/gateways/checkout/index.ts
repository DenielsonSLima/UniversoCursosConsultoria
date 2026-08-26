import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../../_shared/http.ts";
import type { CheckoutRuntime } from "./types.ts";
import { normalizeErrorMessage, providerLabelFor } from "./utils.ts";
import { buildEadCheckoutContext } from "./ead-context.ts";
import {
  echoCheckoutPresentation,
  loadStudentEadCheckoutTarget,
  PaymentCheckoutHttpError,
  resolveStudentEadPaymentOptions,
  validateCheckoutPresentation,
} from "./payment-options.ts";
import { runCourseCheckout } from "./providers/course.ts";
import { handleGatewayCheckout } from "./providers/gateway.ts";

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
    const runtime: CheckoutRuntime = {
      req,
      bodyText,
      body: parseBody(bodyText),
      admin,
      supabaseUrl,
      corsHeaders,
    };

    if (runtime.body.action === "payment-options") {
      return json(await resolveStudentEadPaymentOptions(runtime), 200, req);
    }

    const checkoutTarget = runtime.body.receivableId
      ? (await loadStudentEadCheckoutTarget(
        runtime,
        String(runtime.body.receivableId),
      )).target
      : null;
    const resolvedContext = await buildEadCheckoutContext(
      runtime,
      checkoutTarget,
    );
    if (!resolvedContext) {
      return runCourseCheckout(runtime);
    }

    const context = resolvedContext;
    const presentation = validateCheckoutPresentation(
      runtime.body,
      context.charge.method,
      context.route.providerCode,
      context.course,
    );

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

    return json(
      echoCheckoutPresentation(result.response, presentation),
      200,
      req,
    );
  } catch (error) {
    const message = normalizeErrorMessage(error);
    console.error("Erro no payment-checkout:", error);

    // O checkout e idempotente pelo recebivel. Em falha, preservar matricula,
    // recebivel e eventual lock permite retry/recovery e impede que a requisicao
    // perdedora apague o estado de outra chamada concorrente.

    const status = error instanceof PaymentCheckoutHttpError
      ? error.status
      : 400;
    return json({ error: message }, status, req);
  }
});
