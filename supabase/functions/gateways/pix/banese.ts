import { createBaneseCharge } from "../../banese/core/adapter.ts";
import type { GatewayChargeInput } from "../router.ts";

export const createBanesePixCharge = (input: GatewayChargeInput) =>
  createBaneseCharge({
    admin: input.admin,
    supabaseUrl: input.supabaseUrl,
    environment: input.environment,
    paymentMethod: "PIX",
    receivable: input.receivable,
    payer: input.payer,
    description: input.description,
    amount: input.amount,
    dueDate: input.dueDate,
  });
