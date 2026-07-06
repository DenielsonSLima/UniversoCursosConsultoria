import type { CheckoutRuntime } from "../types.ts";

export const runCourseCheckout = async (context: CheckoutRuntime) => {
  const response = await fetch(`${context.supabaseUrl.replace(/\/+$/, "")}/functions/v1/checkout-api`, {
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
