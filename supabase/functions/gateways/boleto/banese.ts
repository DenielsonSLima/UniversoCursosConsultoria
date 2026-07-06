import { createBaneseCharge } from "../../banese/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createBaneseBoletoCharge = (input: GatewayChargeInput) =>
  createBaneseCharge({
    ...input,
    providerCode: "banese_card",
    paymentMethod: "BOLETO",
    installments: 1,
  } as any);
