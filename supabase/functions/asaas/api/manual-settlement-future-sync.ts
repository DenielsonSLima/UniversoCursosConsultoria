import {
  MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY,
  MANUAL_SETTLEMENT_CONTEXT_STANDARD,
  type ManualSettlementResult,
  type ManualSettlementServiceDependencies,
  type NormalizedManualSettlementRequest,
} from "./manual-settlement.types.ts";
import { createManualSettlementRepository } from "./manual-settlement.repository.ts";
import { shouldSkipTechnicalManualFutureSync } from "../../_shared/technical-manual-future-sync.ts";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const syncManualSettlementFutureCharges = async (
  dependencies: ManualSettlementServiceDependencies,
  request: NormalizedManualSettlementRequest,
  receivable: any,
  result: ManualSettlementResult,
) => {
  if (
    request.settlementContext ===
      MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY
  ) {
    const suppressed = { ...result, futureSyncSuppressed: true };
    try {
      await (dependencies.repository ??
        createManualSettlementRepository(dependencies.admin))
        .updateCompletedResult(result.settlementId, suppressed);
    } catch (auditError) {
      console.error(
        "Falha ao auditar supressão de parcelas futuras:",
        auditError,
      );
    }
    return suppressed;
  }
  if (request.settlementContext !== MANUAL_SETTLEMENT_CONTEXT_STANDARD) {
    throw new Error("Contexto de baixa manual inválido.");
  }
  if (!receivable.matricula_id || !dependencies.syncFutureInstallments) {
    return result;
  }

  let warning: string | null = null;
  try {
    if (
      await shouldSkipTechnicalManualFutureSync(
        dependencies.admin,
        receivable.matricula_id,
      )
    ) return result;

    const { data: enrollment, error } = await dependencies.admin
      .from("matriculas")
      .select(
        "gerar_cobranca_futura, sincronizar_asaas, turmas(gerar_cobrancas_futuras, sincronizar_asaas_futuro)",
      )
      .eq("id", receivable.matricula_id)
      .maybeSingle();
    if (error) throw error;
    const turma = Array.isArray(enrollment?.turmas)
      ? enrollment.turmas[0]
      : enrollment?.turmas;
    const shouldGenerate = enrollment?.gerar_cobranca_futura ??
      turma?.gerar_cobrancas_futuras ?? false;
    const shouldSync = enrollment?.sincronizar_asaas ??
      turma?.sincronizar_asaas_futuro ?? true;
    if (shouldGenerate && shouldSync) {
      const sync = await dependencies.syncFutureInstallments(
        receivable.matricula_id,
      );
      if (sync && "skipped" in sync && sync.skipped && sync.reason) {
        warning = String(sync.reason);
      }
    }
  } catch (error) {
    warning = errorMessage(error);
    try {
      await (dependencies.repository ??
        createManualSettlementRepository(dependencies.admin))
        .setFutureSyncError(receivable.matricula_id, warning);
    } catch (auditError) {
      console.error("Falha ao registrar erro de parcelas futuras:", auditError);
    }
  }

  if (!warning) return result;
  const updated = { ...result, futureSyncWarning: warning };
  try {
    await (dependencies.repository ??
      createManualSettlementRepository(dependencies.admin))
      .updateCompletedResult(result.settlementId, updated);
  } catch (auditError) {
    console.error("Falha ao anexar aviso à baixa concluída:", auditError);
  }
  return updated;
};
