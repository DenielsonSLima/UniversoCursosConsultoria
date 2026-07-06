import { createMercadoPagoCharge } from "../../mercado-pago/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createMercadoPagoCardCharge = (input: GatewayChargeInput) =>
  createMercadoPagoCharge({
    ...input,
    providerCode: "mercado_pago",
    paymentMethod: "CREDIT_CARD",
  } as any);
