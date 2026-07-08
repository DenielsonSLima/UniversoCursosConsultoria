import { createMercadoPagoPixPayment } from "../../mercado-pago/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createMercadoPagoPixCharge = (input: GatewayChargeInput) =>
  createMercadoPagoPixPayment({
    ...input,
    providerCode: "mercado_pago",
    paymentMethod: "PIX",
    installments: 1,
  } as any);
