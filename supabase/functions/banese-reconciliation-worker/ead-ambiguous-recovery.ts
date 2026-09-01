export const EAD_AMBIGUOUS_RECOVERY_TARGETS = Object.freeze(
  {
    "f47cbf46-fe94-4c81-b845-dd7a265c7734": "000097299",
    "1f2a1a90-9cff-4e81-b94e-2138953924e5": "000097302",
  } as const,
);

type RecoveryAdmin = {
  rpc: (
    name: string,
    params?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type ReconcileReceivable = (
  admin: any,
  receivableId: string,
  dependencies: { signal: AbortSignal },
) => Promise<unknown>;

const CLAIM_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EadAmbiguousRecoveryReport = {
  claimed: number;
  done: number;
  failedFinal: number;
  finalizedWithoutGet: number;
};

const targetOurNumber = (receivableId: string) =>
  EAD_AMBIGUOUS_RECOVERY_TARGETS[
    receivableId as keyof typeof EAD_AMBIGUOUS_RECOVERY_TARGETS
  ];

export const recoverEadAmbiguousTitlesOnce = async (
  admin: RecoveryAdmin,
  reconcileReceivable: ReconcileReceivable,
): Promise<EadAmbiguousRecoveryReport> => {
  const report: EadAmbiguousRecoveryReport = {
    claimed: 0,
    done: 0,
    failedFinal: 0,
    finalizedWithoutGet: 0,
  };

  // Quatro iterações cobrem os dois alvos mesmo quando a RPC primeiro fecha
  // um claim interrompido. A própria tabela limita cada alvo a uma tentativa.
  for (let step = 0; step < 4; step += 1) {
    const { data, error } = await admin.rpc(
      "claim_banese_ead_ambiguous_recovery_target",
    );
    if (error) throw new Error("EAD_AMBIGUOUS_CLAIM_FAILED");
    if (!data) break;
    if (typeof data !== "object" || Array.isArray(data)) {
      throw new Error("EAD_AMBIGUOUS_CLAIM_INVALID");
    }

    const claim = data as Record<string, unknown>;
    if (claim.finalized === true) {
      report.finalizedWithoutGet += 1;
      continue;
    }
    const receivableId = String(claim.receivableId || "").toLowerCase();
    const nossoNumero = String(claim.nossoNumero || "");
    const claimToken = String(claim.claimToken || "").toLowerCase();
    if (
      !targetOurNumber(receivableId) ||
      targetOurNumber(receivableId) !== nossoNumero ||
      !CLAIM_TOKEN_PATTERN.test(claimToken)
    ) {
      throw new Error("EAD_AMBIGUOUS_TARGET_REJECTED");
    }

    report.claimed += 1;
    let success: boolean;
    const controller = new globalThis.AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new globalThis.DOMException("Banese GET timeout", "TimeoutError"),
        ),
      25_000,
    );
    try {
      await reconcileReceivable(admin, receivableId, {
        signal: controller.signal,
      });
      success = true;
    } catch {
      success = false;
    } finally {
      clearTimeout(timeout);
    }

    const { data: completed, error: completionError } = await admin.rpc(
      "complete_banese_ead_ambiguous_recovery_target",
      {
        p_receivable_id: receivableId,
        p_claim_token: claimToken,
        p_success: success,
        p_failure_code: success ? null : "GET_RECONCILIATION_FAILED",
      },
    );
    if (completionError) throw new Error("EAD_AMBIGUOUS_COMPLETE_FAILED");
    if (completed === true) report.done += 1;
    else report.failedFinal += 1;
  }
  return report;
};

export const handledEadAmbiguousRecovery = (
  report: EadAmbiguousRecoveryReport,
) => report.claimed > 0 || report.finalizedWithoutGet > 0;
