import type { GatewayChargeInput } from "../router.ts";

export const createAsaasPixCharge = (_input: GatewayChargeInput): never => {
  throw new Error("Pix Asaas usa o fluxo proprio do Asaas.");
};
