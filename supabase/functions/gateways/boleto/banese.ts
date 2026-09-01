import { createBaneseCharge } from "../../banese/core/adapter.ts";
import { assertBaneseFinancialTermsEqual } from "../../banese/internal/financial-terms-response.ts";
import { normalizeBaneseFinancialTerms } from "../../banese/internal/financial-terms.ts";
import {
  applyCheckoutAttemptSnapshot,
  gatewayAttemptIsOwned,
} from "../checkout/gateway-creation-fence.ts";
import { applyReceivableSnapshotFields } from "../checkout/remote-title-guard.ts";
import type { GatewayChargeInput } from "../router.ts";

export const persistBaneseBoletoIntent = async (input: GatewayChargeInput) => {
  if (!input.financialTerms) {
    throw new Error(
      "Boleto Banese exige snapshot financeiro canonico antes do registro remoto.",
    );
  }
  const attemptToken = String(
    input.receivable?.gateway_creation_token || "",
  ).trim();
  if (!gatewayAttemptIsOwned(input.receivable, attemptToken)) {
    throw new Error(
      "A tentativa Banese nao possui ownership valido para persistir o pedido canonico.",
    );
  }

  const inputAmountCents = Math.round(Number(input.amount) * 100);
  const receivableAmountCents = Math.round(
    Number(input.receivable?.valor) * 100,
  );
  const inputDueDate = String(input.dueDate || "").slice(0, 10);
  const receivableDueDate = String(
    input.receivable?.data_vencimento || "",
  ).slice(0, 10);
  if (
    !Number.isSafeInteger(inputAmountCents) || inputAmountCents <= 0 ||
    inputAmountCents !== receivableAmountCents ||
    inputDueDate !== receivableDueDate
  ) {
    throw new Error(
      "Valor ou vencimento do pedido Banese diverge do recebivel sob ownership.",
    );
  }

  const intendedTerms = normalizeBaneseFinancialTerms({
    ...input.financialTerms,
    nominalAmount: input.amount,
    dueDate: inputDueDate,
  });
  const storedTerms = input.receivable?.gateway_financial_terms;
  if (storedTerms && typeof storedTerms === "object") {
    assertBaneseFinancialTermsEqual(
      intendedTerms,
      normalizeBaneseFinancialTerms(storedTerms as any),
    );
  } else if (input.receivable?.gateway_financial_terms_confirmed_at) {
    throw new Error(
      "Snapshot financeiro Banese confirmado esta inconsistente e nao pode ser sobrescrito.",
    );
  }

  const intendedAt = new Date().toISOString();
  let query = input.admin
    .from("contas_receber")
    .update({
      gateway_financial_terms: intendedTerms,
      gateway_financial_terms_confirmed_at:
        input.receivable?.gateway_financial_terms_confirmed_at || null,
      updated_at: intendedAt,
    })
    .eq("id", input.receivable.id)
    .eq("gateway_provider", "banese_card")
    .eq("gateway_environment", input.environment)
    .eq("gateway_payment_method", "BOLETO")
    .eq("gateway_status", "CREATING")
    .eq("gateway_creation_token", attemptToken)
    .is("gateway_payment_id", null);
  query = applyCheckoutAttemptSnapshot(query, input.receivable);
  query = applyReceivableSnapshotFields(query, input.receivable, [
    "gateway_financial_terms",
    "gateway_financial_terms_confirmed_at",
  ]);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "A cobranca mudou antes de persistir o pedido financeiro Banese; nenhum POST foi realizado.",
    );
  }
  return {
    receivable: { ...input.receivable, ...data },
    financialTerms: intendedTerms,
  };
};

export const createBaneseBoletoCharge = async (input: GatewayChargeInput) => {
  const intended = await persistBaneseBoletoIntent(input);
  return createBaneseCharge({
    admin: input.admin,
    supabaseUrl: input.supabaseUrl,
    environment: input.environment,
    paymentMethod: "BOLETO",
    receivable: intended.receivable,
    payer: input.payer,
    description: input.description,
    amount: input.amount,
    dueDate: input.dueDate,
    successUrl: input.successUrl,
    pendingUrl: input.pendingUrl,
    financialTerms: intended.financialTerms,
    allowPendingBolePix: input.allowPendingBolePix === true,
  });
};
