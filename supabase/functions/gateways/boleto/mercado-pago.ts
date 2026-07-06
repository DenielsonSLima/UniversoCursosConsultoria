import { createMercadoPagoCharge } from "../../mercado-pago/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createMercadoPagoBoletoCharge = (input: GatewayChargeInput) =>
  createMercadoPagoCharge({
    ...input,
    providerCode: "mercado_pago",
    paymentMethod: "BOLETO",
    installments: 1,
  } as any);
