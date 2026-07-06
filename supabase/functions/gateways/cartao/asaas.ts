import { createAsaasCharge } from "../../asaas/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createAsaasCardCharge = (input: GatewayChargeInput) =>
  createAsaasCharge({
    ...input,
    providerCode: "asaas",
    paymentMethod: "CREDIT_CARD",
  } as any);
