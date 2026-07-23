import { hasRepairableOnlineInscriptionIdentity } from "../../gateways/online-inscription.ts";
import {
  activateEnrollmentAfterPayment,
  syncOnlineInscriptionPayment,
} from "../../gateways/webhook/domain/ead-enrollment.ts";
import { createManualSettlementRepository } from "./manual-settlement.repository.ts";
import type {
  ManualSettlementResult,
  ManualSettlementServiceDependencies,
  NormalizedManualSettlementRequest,
} from "./manual-settlement.types.ts";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const providerCodeFor = (receivable: any) =>
  String(receivable?.gateway_provider || "").trim().toLowerCase() ||
  (receivable?.asaas_payment_id || receivable?.asaas_payment_link_id
    ? "asaas"
    : null);

const defaultSyncOnlineInscriptionPayment: NonNullable<
  ManualSettlementServiceDependencies["syncOnlineInscriptionPayment"]
> = (context, input) =>
  syncOnlineInscriptionPayment(context as any, input);

const defaultActivateEnrollmentAfterPayment: NonNullable<
  ManualSettlementServiceDependencies["activateEnrollmentAfterPayment"]
> = (context, receivable) =>
  activateEnrollmentAfterPayment(context as any, receivable);

export const syncManualSettlementAcademicEffects = async (
  dependencies: ManualSettlementServiceDependencies,
  request: NormalizedManualSettlementRequest,
  result: ManualSettlementResult,
) => {
  const repository = dependencies.repository ??
    createManualSettlementRepository(dependencies.admin);
  let settledReceivable: any;
  try {
    settledReceivable = await repository.getReceivable(request.receivableId);
    if (String(settledReceivable.status || "").toUpperCase() !== "PAGO") {
      throw new Error(
        "A cobrança não está paga para concluir a projeção acadêmica.",
      );
    }

    if (hasRepairableOnlineInscriptionIdentity(settledReceivable)) {
      await (dependencies.syncOnlineInscriptionPayment ??
        defaultSyncOnlineInscriptionPayment)(
          { admin: dependencies.admin },
          {
            receivable: settledReceivable,
            gatewayProvider: providerCodeFor(settledReceivable)!,
            environment: String(settledReceivable.gateway_environment),
            paymentId: settledReceivable.gateway_payment_id ||
              settledReceivable.asaas_payment_id ||
              settledReceivable.gateway_boleto_nosso_numero || null,
            paymentLinkId: settledReceivable.gateway_payment_link_id ||
              settledReceivable.asaas_payment_link_id || null,
            localStatus: "PAGO",
            legacyPaymentMethod: String(
              settledReceivable.forma_pagamento || request.paymentMethod,
            ),
            pendingStatus: "AGUARDANDO_PAGAMENTO",
          },
        );
    }

    await (dependencies.activateEnrollmentAfterPayment ??
      defaultActivateEnrollmentAfterPayment)(
        { admin: dependencies.admin },
        settledReceivable,
      );
  } catch (error) {
    const warning = errorMessage(error);
    const updated = {
      ...result,
      academicSyncCompleted: false,
      academicSyncWarning: warning,
    };
    try {
      await repository.updateCompletedResult(result.settlementId, updated);
      await repository.appendEvent(
        result.settlementId,
        dependencies.actor.id,
        "ACADEMIC_PROJECTION_FAILED",
        { error: warning.slice(0, 1000) },
      );
    } catch (auditError) {
      console.error(
        "Falha ao auditar projeção acadêmica pendente da baixa manual:",
        auditError,
      );
    }
    throw new Error(
      `A baixa financeira foi concluída, mas a projeção acadêmica ficou pendente e pode ser retomada com a mesma chave: ${warning}`,
      { cause: error },
    );
  }

  const updated = {
    ...result,
    academicSyncCompleted: true,
    academicSyncWarning: null,
  };
  try {
    await repository.updateCompletedResult(result.settlementId, updated);
  } catch (auditError) {
    console.error(
      "Falha ao persistir conclusão acadêmica da baixa manual:",
      auditError,
    );
  }
  return { receivable: settledReceivable, result: updated };
};
