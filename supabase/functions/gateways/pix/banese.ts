import { createBaneseCharge } from "../../banese/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createBanesePixCharge = (input: GatewayChargeInput) =>
  createBaneseCharge({
    ...input,
    providerCode: "banese_card",
    paymentMethod: "PIX",
    installments: 1,
  } as any);
