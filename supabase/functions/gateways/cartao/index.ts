import type { GatewayChargeInput } from "../router.ts";

export const createCardGatewayCharge = async (input: GatewayChargeInput) => {
  if (input.providerCode === "asaas") {
    const { createAsaasCardCharge } = await import("./asaas.ts");
    return createAsaasCardCharge(input);
  }
  if (input.providerCode === "mercado_pago") {
    const { createMercadoPagoCardCharge } = await import("./mercado-pago.ts");
    return createMercadoPagoCardCharge(input);
  }
  if (input.providerCode === "banese_card") {
    const { createBaneseCardCharge } = await import("./banese.ts");
    return createBaneseCardCharge(input);
  }
  throw new Error("Gateway Cartao nao configurado para o provedor selecionado.");
};
