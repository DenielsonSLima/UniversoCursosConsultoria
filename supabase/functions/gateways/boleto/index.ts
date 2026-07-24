import type { GatewayChargeInput } from "../router.ts";
import { createAsaasBoletoCharge } from "./asaas.ts";
import { createMercadoPagoBoletoCharge } from "./mercado-pago.ts";
import { createBaneseBoletoCharge } from "./banese.ts";

export const createBoletoGatewayCharge = async (input: GatewayChargeInput) => {
  if (input.providerCode === "asaas") {
    return createAsaasBoletoCharge(input);
  }
  if (input.providerCode === "mercado_pago") {
    return createMercadoPagoBoletoCharge(input);
  }
  if (input.providerCode === "banese_card") {
    return createBaneseBoletoCharge(input);
  }
  throw new Error(
    "Gateway Boleto nao configurado para o provedor selecionado.",
  );
};
