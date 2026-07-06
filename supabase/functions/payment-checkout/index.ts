import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import { buildEadCheckoutContext } from "./ead-context.ts";
import { runCourseCheckout } from "./providers/course.ts";
import { handleGatewayCheckout } from "./providers/gateway.ts";
import type { CheckoutRuntime, EadCheckoutContext } from "./types.ts";
import { normalizeErrorMessage, providerLabelFor } from "./utils.ts";

const parseBody = (bodyText: string) => {
  try {
    return JSON.parse(bodyText || "{}");
  } catch {
    throw new Error("Payload invalido.");
  }
};

const cancelLocalCheckout = async (
  context: EadCheckoutContext,
  input: { createdRemotePayment: boolean; receivableId?: string | null },
) => {
  if (input.createdRemotePayment) return;

  if (input.receivableId) {
    await context.admin.from("contas_receber")
      .delete()
      .eq("id", input.receivableId)
      .is("gateway_payment_id", null)
      .neq("status", "PAGO")
      .then(() => {});
  }

  if (context.matricula?.id) {
    await context.admin.from("matriculas")
      .update({ status: "CANCELADO" })
      .eq("id", context.matricula.id)
      .in("status", [
        "PENDENTE",
        "AGUARDANDO_PAGAMENTO",
        "AGUARDANDO_CONFIRMACAO",
      ])
      .then(() => {});
  }
};

const remotePaymentWasCreated = (error: unknown) =>
  Boolean(
    error && typeof error === "object" &&
      (error as Record<string, unknown>).remotePaymentCreated === true,
  );

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

  let context: EadCheckoutContext | null = null;
  let createdRemotePayment = false;
  let checkoutReceivableId: string | null = null;

  try {
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
      return runCourseCheckout(runtime);
    }

    context = resolvedContext;

    const result = await handleGatewayCheckout(context);
    createdRemotePayment = result.createdRemotePayment;
    checkoutReceivableId = result.receivableId || null;

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

    if (context) {
      await cancelLocalCheckout(context, {
        createdRemotePayment: createdRemotePayment ||
          remotePaymentWasCreated(error),
        receivableId: checkoutReceivableId,
      });
    }

    return json({ error: message }, 400, req);
  }
});
