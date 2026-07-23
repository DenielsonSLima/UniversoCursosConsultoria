import type { GatewayChargeInput } from "../router.ts";

export const createBoletoGatewayCharge = async (input: GatewayChargeInput) => {
  if (input.providerCode === "asaas") {
    const { createAsaasBoletoCharge } = await import("./asaas.ts");
    return createAsaasBoletoCharge(input);
  }
  if (input.providerCode === "mercado_pago") {
    const { createMercadoPagoBoletoCharge } = await import("./mercado-pago.ts");
    return createMercadoPagoBoletoCharge(input);
  }
  if (input.providerCode === "banese_card") {
    const { createBaneseBoletoCharge } = await import("./banese.ts");
    return createBaneseBoletoCharge(input);
  }
  throw new Error(
    "Gateway Boleto nao configurado para o provedor selecionado.",
  );
};
