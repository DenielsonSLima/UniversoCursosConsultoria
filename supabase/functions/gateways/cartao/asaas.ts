import type { GatewayChargeInput } from "../router.ts";

export const createAsaasCardCharge = (_input: GatewayChargeInput): never => {
  throw new Error("Cartao Asaas usa o fluxo proprio do Asaas.");
};
