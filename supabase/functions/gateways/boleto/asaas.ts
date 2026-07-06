import type { GatewayChargeInput } from "../router.ts";

export const createAsaasBoletoCharge = (_input: GatewayChargeInput): never => {
  throw new Error("Boleto Asaas usa o fluxo proprio do Asaas.");
};
