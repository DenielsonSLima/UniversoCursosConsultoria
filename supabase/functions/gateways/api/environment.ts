import type { GatewayEnvironment } from "../router.ts";

export const requireGatewayEnvironment = (
  value: unknown,
  context = "titulo bancario",
): GatewayEnvironment => {
  if (value === "sandbox" || value === "production") return value;
  throw new Error(
    `Ambiente ausente ou invalido no ${context}. Reconcilie o registro antes de movimentar o titulo.`,
  );
};
