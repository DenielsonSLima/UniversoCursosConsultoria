import { requireGestorForPolo, requireOtherCreditsWriteAccess } from "./authz.ts";
import { UUID_RE } from "./shared.ts";
import type { AsaasApiContext, AsaasApiResponder } from "./request-context.ts";

export async function handleAsaasReceivableSyncAction(
  action: string, context: AsaasApiContext, respondJson: AsaasApiResponder,
): Promise<Response | null> {
  const { admin, body, gestor, getGatewayRuntimeForReceivableMovement, syncReceivable } = context;
  if (action === "sync-receivable") {
    const receivableId = String(body.receivableId || "").trim();
    if (!UUID_RE.test(receivableId)) {
      throw new Error("Cobrança inválida para sincronização.");
    }
    const { data: receivableToSync, error: receivableToSyncError } =
      await admin
        .from("contas_receber")
        .select(
          "id, polo_id, outros_creditos_plano_id, asaas_payment_id, asaas_payment_link_id, asaas_status, gateway_provider, gateway_environment, gateway_payment_id, gateway_payment_link_id, gateway_boleto_nosso_numero, gateway_status",
        )
        .eq("id", receivableId)
        .single();
    if (receivableToSyncError) throw receivableToSyncError;
    if (gestor) {
      requireGestorForPolo(gestor, receivableToSync.polo_id);
      if (receivableToSync.outros_creditos_plano_id) requireOtherCreditsWriteAccess(gestor);
    }

    const runtime = await getGatewayRuntimeForReceivableMovement(
      receivableToSync,
    );
    const receivable = await syncReceivable(runtime, receivableId);
    return respondJson({ success: true, receivable });
  }

  return null;
}
