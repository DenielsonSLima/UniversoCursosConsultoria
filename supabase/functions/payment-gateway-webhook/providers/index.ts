import type { GatewayWebhookContext } from "../types.ts";
import { processMercadoPagoWebhook } from "./mercado-pago.ts";

export const processGatewayWebhook = async (context: GatewayWebhookContext) => {
  if (context.providerCode === "mercado_pago") {
    return processMercadoPagoWebhook(context);
  }

  return {
    processed: true,
    ignored: true,
    reason: "provider_not_implemented",
  };
};
