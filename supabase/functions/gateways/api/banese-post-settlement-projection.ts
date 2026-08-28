import type { Environment } from "./config.ts";
import {
  activateEnrollmentAfterPayment,
  syncOnlineInscriptionPayment,
} from "../webhook/domain/ead-enrollment.ts";
import { clearBanesePostSettlementPending } from "./banese-post-settlement.ts";

export const completeBanesePostSettlement = async (
  admin: any,
  input: {
    receivable: Record<string, any>;
    environment: Environment;
    nossoNumero: string;
    settlementMethod: string;
    syncFutureInstallments?: (
      matriculaId: string,
      environment: Environment,
    ) => Promise<unknown>;
  },
) => {
  let updated = input.receivable;
  await activateEnrollmentAfterPayment({ admin } as any, updated);
  await syncOnlineInscriptionPayment({ admin } as any, {
    receivable: updated,
    gatewayProvider: "banese_card",
    environment: input.environment,
    paymentId: input.nossoNumero,
    paymentLinkId: null,
    localStatus: "PAGO",
    legacyPaymentMethod: String(
      updated.forma_pagamento || input.settlementMethod,
    ),
    pendingStatus: "AGUARDANDO_PAGAMENTO",
  });
  let futureSyncWarning: string | null = null;
  if (
    input.syncFutureInstallments &&
    updated.matricula_id &&
    String(updated.tipo_lancamento || "").toUpperCase() === "MATRICULA"
  ) {
    const { data: matricula, error: matriculaError } = await admin
      .from("matriculas")
      .select(
        "gerar_cobranca_futura, sincronizar_asaas, turmas(gerar_cobrancas_futuras, sincronizar_asaas_futuro)",
      )
      .eq("id", updated.matricula_id)
      .maybeSingle();
    if (matriculaError) throw matriculaError;
    const turma = Array.isArray(matricula?.turmas)
      ? matricula.turmas[0]
      : matricula?.turmas;
    const gerarFutura = matricula?.gerar_cobranca_futura ??
      turma?.gerar_cobrancas_futuras ?? false;
    const syncEnabled = matricula?.sincronizar_asaas ??
      turma?.sincronizar_asaas_futuro ?? true;
    if (gerarFutura && syncEnabled) {
      try {
        await input.syncFutureInstallments(
          updated.matricula_id,
          input.environment,
        );
      } catch (syncError) {
        futureSyncWarning = syncError instanceof Error
          ? syncError.message
          : String(syncError);
      }
    }
  }

  updated = await clearBanesePostSettlementPending(
    admin,
    updated,
    futureSyncWarning
      ? `Pagamento Banese conciliado; parcelas futuras pendentes: ${futureSyncWarning}`
      : null,
  );

  return { updated, futureSyncWarning };
};
