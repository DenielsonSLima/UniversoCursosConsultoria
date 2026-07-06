import { createAsaasCharge } from "../../asaas/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createAsaasBoletoCharge = (input: GatewayChargeInput) =>
  createAsaasCharge({
    ...input,
    providerCode: "asaas",
    paymentMethod: "BOLETO",
    installments: 1,
  } as any);
