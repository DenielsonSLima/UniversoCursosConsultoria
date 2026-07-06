import { createAsaasCharge } from "../../asaas/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createAsaasPixCharge = (input: GatewayChargeInput) =>
  createAsaasCharge({
    ...input,
    providerCode: "asaas",
    paymentMethod: "PIX",
    installments: 1,
  } as any);
