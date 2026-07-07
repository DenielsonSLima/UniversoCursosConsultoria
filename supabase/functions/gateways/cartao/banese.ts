import type { GatewayChargeInput } from "../router.ts";

export const createBaneseCardCharge = (_input: GatewayChargeInput): never => {
  throw new Error("Banese nao aceita cartao neste fluxo de checkout online.");
};
