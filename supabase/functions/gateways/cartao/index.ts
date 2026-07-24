import type { GatewayChargeInput } from "../router.ts";
import { createAsaasCardCharge } from "./asaas.ts";
import { createMercadoPagoCardCharge } from "./mercado-pago.ts";
import { createBaneseCardCharge } from "./banese.ts";

export const createCardGatewayCharge = async (input: GatewayChargeInput) => {
  if (input.providerCode === "asaas") {
    return createAsaasCardCharge(input);
  }
  if (input.providerCode === "mercado_pago") {
    return createMercadoPagoCardCharge(input);
  }
  if (input.providerCode === "banese_card") {
    return createBaneseCardCharge(input);
  }
  throw new Error(
    "Gateway Cartao nao configurado para o provedor selecionado.",
  );
};
