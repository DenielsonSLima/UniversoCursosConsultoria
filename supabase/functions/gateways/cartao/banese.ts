import type { GatewayChargeInput } from "../router.ts";

export const createBaneseCardCharge = (_input: GatewayChargeInput): never => {
  throw new Error("Cartao Banese ainda nao implementado para checkout online.");
};
