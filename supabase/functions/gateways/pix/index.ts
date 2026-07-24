import type { GatewayChargeInput } from "../router.ts";
import { createAsaasPixCharge } from "./asaas.ts";
import { createMercadoPagoPixCharge } from "./mercado-pago.ts";
import { createBanesePixCharge } from "./banese.ts";

export const createPixGatewayCharge = async (input: GatewayChargeInput) => {
  if (input.providerCode === "asaas") {
    return createAsaasPixCharge(input);
  }
  if (input.providerCode === "mercado_pago") {
    return createMercadoPagoPixCharge(input);
  }
  if (input.providerCode === "banese_card") {
    return createBanesePixCharge(input);
  }
  throw new Error("Gateway Pix nao configurado para o provedor selecionado.");
};
