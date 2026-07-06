import type { CheckoutRuntime, EadCheckoutContext } from "../types.ts";

export const proxyToAsaasCheckout = async (context: CheckoutRuntime | EadCheckoutContext) => {
  const response = await fetch(`${context.supabaseUrl.replace(/\/+$/, "")}/functions/v1/asaas-checkout`, {
    method: "POST",
    headers: {
      Authorization: context.req.headers.get("Authorization") || "",
      apikey: context.req.headers.get("apikey") || "",
      "Content-Type": "application/json",
    },
    body: context.bodyText,
  });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      ...context.corsHeaders,
      "Content-Type": response.headers.get("Content-Type") || "application/json",
    },
  });
};
