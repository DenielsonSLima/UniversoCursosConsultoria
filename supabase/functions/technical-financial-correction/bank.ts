import { cancelBaneseBoleto } from "../banese/core/adapter/boleto-cancellation.ts";
import type { SupabaseAdminRpcClient } from "../banese/core/adapter/types.ts";
import type { BaneseFinancialTermsInput } from "../banese/internal/financial-terms.ts";
import type { BankInput, CorrectionBank } from "./processor.ts";

/**
 * Uses the current canonical adapter for identity, strict PagamentosEfetivados,
 * discount/interest/penalty matching, processing-payment guard and GET after PUT.
 * No secret is exposed to callers and no direct HTTP banking code is duplicated.
 */
export const createCorrectionBank = (
  admin: SupabaseAdminRpcClient,
  signal?: AbortSignal,
): CorrectionBank => {
  const run = async (environment: "production" | "sandbox", input: BankInput) => {
    const canceled = await cancelBaneseBoleto(admin, environment, {
      ...input,
      expectedFinancialTerms: input.expectedFinancialTerms as BaneseFinancialTermsInput,
      stopWhenPixAvailable: false,
      strictEffectivePayments: true,
      signal,
    });
    if (canceled.situationCode !== 5 || canceled.remoteStatus !== "CANCELED" || canceled.pixAvailable) {
      throw new Error("BANK_CONFIRMATION_INVALID");
    }
    return {
      ...canceled,
      // Successful canonical return follows strict payment/identity/terms checks.
      proof: { strictEffectivePayments: true, paymentsCount: 0,
        identityValidated: true, termsValidated: true } as const,
    };
  };
  return {
    cancel: run,
    // Canonical adapter returns immediately for bank code5, without a PUT.
    // If still code2 it awaits this callback BEFORE any PUT, which blocks it.
    confirmOnly: (environment, input) => run(environment, {
      ...input,
      onMutationStart: async () => { throw new Error("CONFIRM_ONLY_MUTATION_BLOCKED"); },
    }),
  };
};
