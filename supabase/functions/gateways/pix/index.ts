import type { GatewayChargeInput } from "../router.ts";

export const createPixGatewayCharge = async (input: GatewayChargeInput) => {
  if (input.providerCode === "asaas") {
    const { createAsaasPixCharge } = await import("./asaas.ts");
    return createAsaasPixCharge(input);
  }
  if (input.providerCode === "mercado_pago") {
    const { createMercadoPagoPixCharge } = await import("./mercado-pago.ts");
    return createMercadoPagoPixCharge(input);
  }
  if (input.providerCode === "banese_card") {
    const { createBanesePixCharge } = await import("./banese.ts");
    return createBanesePixCharge(input);
  }
  throw new Error("Gateway Pix nao configurado para o provedor selecionado.");
};
