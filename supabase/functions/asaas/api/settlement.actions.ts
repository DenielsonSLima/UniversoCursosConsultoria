import { requireGestorForPolo } from "./authz.ts";
import { UUID_RE } from "./shared.ts";
import { executeManualSettlementAction } from "./manual-settlement.action.ts";
import { syncRouteAwareFutureInstallments } from "./route-aware-future-sync.ts";
import { resolveManualSettlementReversalGateway } from "./gateway-routing-guard.ts";
import { applyRemoteIdentitySnapshot, applyReceivableSnapshotFields } from "../../gateways/checkout/remote-title-guard.ts";

import type { AsaasApiContext, AsaasApiResponder } from "./request-context.ts";

export async function handleAsaasSettlementAction(action: string, context: AsaasApiContext, respondJson: AsaasApiResponder): Promise<Response | null> {
  const { admin, body, gestor, getRuntimeForReceivableMovement, getGatewayRuntimeForMovement, syncReceivable } = context;
  if (action === "manual-settlement") {
    const result = await executeManualSettlementAction({
      admin,
      actor: gestor,
      body,
      requirePoloAccess: requireGestorForPolo,
      getAsaasRuntime: getRuntimeForReceivableMovement,
      syncFutureInstallments: async (matriculaId) => {
        const runtime = await getGatewayRuntimeForMovement();
        return await syncRouteAwareFutureInstallments(
          admin,
          matriculaId,
          runtime.environment,
        );
      },
    });
    return respondJson(result);
  }
  if (action === "reverse-manual-settlement") {
    const receivableId = String(body.receivableId || "").trim();
    if (!UUID_RE.test(receivableId)) {
      throw new Error("Cobrança inválida para estorno.");
    }
    const recreateAsaas = body.recreateAsaas !== false;
    const { data: receivable, error } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .single();
    if (error) throw error;
    if (gestor) requireGestorForPolo(gestor, receivable.polo_id);
    if (receivable.status !== "PAGO") {
      throw new Error("Somente cobranças pagas podem ser estornadas.");
    }
    if (receivable.origem_pagamento !== "PRESENCIAL") {
      throw new Error("Este estorno é permitido apenas para baixas manuais.");
    }

    const {
      oldAsaasPaymentId,
      oldGatewayPaymentId,
      oldGatewayPaymentLinkId,
      shouldRecreateAsaas,
      shouldRecreateBanese,
      shouldRecreateGateway,
      clearCanceledBanese,
      clearCanceledGateway,
      restoredLegacyPaymentMethod,
    } = resolveManualSettlementReversalGateway(
      receivable,
      recreateAsaas,
    );
    const reversalTimestamp = new Date().toISOString();
    const isIsolatedDependency =
      String(receivable.tipo_lancamento || "").toUpperCase() ===
        "DEPENDENCIA" &&
      receivable.regra_financeira_dependencia_snapshot?.origem ===
        "DEPENDENCIA";

    let reverseQuery = admin
      .from("contas_receber")
      .update({
        status: "PENDENTE",
        conta_bancaria_id: null,
        valor_pago: null,
        data_pagamento: null,
        manual_settlement_reversed_at: reversalTimestamp,
        forma_pagamento: clearCanceledGateway
          ? restoredLegacyPaymentMethod
          : isIsolatedDependency
          ? "BOLETO"
          : null,
        origem_pagamento: shouldRecreateAsaas
          ? "ASAAS"
          : shouldRecreateBanese
          ? "BANESE"
          : "LOCAL",
        asaas_payment_id: shouldRecreateAsaas ? null : oldAsaasPaymentId,
        nosso_numero_asaas: shouldRecreateAsaas
          ? null
          : receivable.nosso_numero_asaas,
        asaas_invoice_url: shouldRecreateAsaas
          ? null
          : receivable.asaas_invoice_url,
        asaas_bank_slip_url: shouldRecreateAsaas
          ? null
          : receivable.asaas_bank_slip_url,
        asaas_transaction_receipt_url: shouldRecreateAsaas
          ? null
          : receivable.asaas_transaction_receipt_url,
        asaas_installment_id: shouldRecreateAsaas
          ? null
          : receivable.asaas_installment_id,
        asaas_status: shouldRecreateAsaas ? null : receivable.asaas_status,
        asaas_synced_at: shouldRecreateAsaas
          ? null
          : receivable.asaas_synced_at,
        asaas_last_error: oldAsaasPaymentId
          ? `Baixa manual estornada. Cobrança Asaas anterior: ${oldAsaasPaymentId}. ${
            body.reason ? `Motivo: ${String(body.reason).slice(0, 180)}` : ""
          }`
          : body.reason
          ? `Baixa manual estornada. Motivo: ${
            String(body.reason).slice(0, 180)
          }`
          : null,
        ...(clearCanceledGateway
          ? {
            gateway_payment_id: null,
            gateway_payment_link_id: null,
            gateway_invoice_url: null,
            gateway_bank_slip_url: null,
            gateway_pix_payload: null,
            gateway_pix_encoded_image: null,
            gateway_boleto_linha_digitavel: null,
            gateway_boleto_codigo_barras: null,
            gateway_boleto_nosso_numero: null,
            gateway_boleto_issued_at: null,
            gateway_financial_terms: null,
            gateway_financial_terms_confirmed_at: null,
            gateway_transaction_receipt_url: null,
            gateway_status: null,
            gateway_synced_at: null,
            gateway_last_error: `Baixa manual estornada. Titulo ${
              clearCanceledBanese ? "Banese" : "Asaas"
            } anterior: ${
              oldGatewayPaymentId || oldGatewayPaymentLinkId ||
              oldAsaasPaymentId
            }. ${
              body.reason
                ? `Motivo: ${String(body.reason).slice(0, 180)}`
                : ""
            }`,
          }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivableId)
      .eq("status", "PAGO")
      .eq("origem_pagamento", "PRESENCIAL");
    reverseQuery = applyRemoteIdentitySnapshot(reverseQuery, receivable);
    reverseQuery = applyReceivableSnapshotFields(
      reverseQuery,
      receivable,
      [
        "conta_bancaria_id",
        "valor_pago",
        "data_pagamento",
        "manual_settlement_id",
        "manual_settlement_reversed_at",
        "forma_pagamento",
        "gateway_status",
        "asaas_status",
        "updated_at",
      ],
    );
    const { data: reverted, error: updateError } = await reverseQuery
      .select()
      .maybeSingle();
    if (updateError) throw updateError;
    if (!reverted) {
      throw new Error(
        "A baixa mudou durante o estorno. Atualize a tela antes de tentar novamente.",
      );
    }

    const requiresDependencyCheckout = Boolean(
      isIsolatedDependency && shouldRecreateGateway,
    );
    const finalReceivable = shouldRecreateGateway && !requiresDependencyCheckout
      ? await syncReceivable(
        await getGatewayRuntimeForMovement(),
        reverted.id,
      )
      : reverted;

    return respondJson({
      success: true,
      receivable: finalReceivable,
      asaasRecreated: shouldRecreateAsaas,
      baneseRecreated: shouldRecreateBanese && !requiresDependencyCheckout,
      gatewayRecreated: shouldRecreateGateway && !requiresDependencyCheckout,
      requiresDependencyCheckout,
      gatewayProvider: shouldRecreateBanese
        ? "banese_card"
        : shouldRecreateAsaas
        ? "asaas"
        : null,
    });
  }

  return null;
}
