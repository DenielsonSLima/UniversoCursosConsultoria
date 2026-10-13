import { requireGestorForPolo } from "./authz.ts";
import { UUID_RE } from "./shared.ts";
import { applyRemoteIdentitySnapshot, assertAsaasReceivableCancellationAllowed } from "../../gateways/checkout/remote-title-guard.ts";

import type { AsaasApiContext, AsaasApiResponder } from "./request-context.ts";

export async function handleAsaasCancellationAction(action: string, context: AsaasApiContext, respondJson: AsaasApiResponder): Promise<Response | null> {
  const { admin, body, gestor, getRuntimeForReceivableMovement } = context;
  if (action === "cancel-receivable") {
    const receivableId = String(body.receivableId || "").trim();
    if (!UUID_RE.test(receivableId)) {
      throw new Error("Cobrança inválida para cancelamento.");
    }

    const { data: receivable, error } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .single();
    if (error) throw error;
    if (gestor) requireGestorForPolo(gestor, receivable.polo_id);
    assertAsaasReceivableCancellationAllowed(receivable);

    if (
      receivable.status === "PAGO" ||
      ["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)
    ) {
      throw new Error(
        "Cobranças pagas/confirmadas não podem ser canceladas por este fluxo.",
      );
    }

    const runtime = await getRuntimeForReceivableMovement(receivable);

    let asaasCanceled = false;
    let asaasDeleteStatus: number | null = null;
    let asaasPaymentLinkCanceled = false;
    let asaasPaymentLinkDeleteStatus: number | null = null;

    if (receivable.asaas_payment_id) {
      const response = await fetch(
        `${runtime.baseUrl}/payments/${receivable.asaas_payment_id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: runtime.apiKey,
          },
        },
      );
      asaasDeleteStatus = response.status;
      const payload = response.status === 204
        ? null
        : await response.json().catch(() => null);

      if (response.ok) {
        asaasCanceled = true;
      } else if (response.status === 404) {
        if (
          String(receivable.asaas_status || "").toUpperCase() !== "DELETED"
        ) {
          throw new Error(
            "Cobrança Asaas não encontrada no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.",
          );
        }
      } else {
        const message = payload?.errors?.map((item: any) =>
          item.description
        ).join(" ") ||
          payload?.message ||
          `Erro ${response.status} ao cancelar cobrança no Asaas.`;
        throw new Error(message);
      }
    }

    if (receivable.asaas_payment_link_id) {
      const response = await fetch(
        `${runtime.baseUrl}/paymentLinks/${receivable.asaas_payment_link_id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: runtime.apiKey,
          },
        },
      );
      asaasPaymentLinkDeleteStatus = response.status;
      const payload = response.status === 204
        ? null
        : await response.json().catch(() => null);

      if (response.ok) {
        asaasPaymentLinkCanceled = true;
      } else if (response.status === 404) {
        if (
          !asaasCanceled &&
          String(receivable.asaas_status || "").toUpperCase() !== "DELETED"
        ) {
          throw new Error(
            "Link de pagamento Asaas não encontrado no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.",
          );
        }
        asaasPaymentLinkCanceled = true;
      } else {
        const message = payload?.errors?.map((item: any) =>
          item.description
        ).join(" ") ||
          payload?.message ||
          `Erro ${response.status} ao remover link de pagamento no Asaas.`;
        throw new Error(message);
      }
    }

    const cancelUpdate = admin
      .from("contas_receber")
      .update({
        status: "CANCELADO",
        asaas_status: "DELETED",
        asaas_payment_link_id: null,
        nosso_numero_asaas:
          receivable.asaas_payment_link_id && !receivable.asaas_payment_id
            ? null
            : receivable.nosso_numero_asaas,
        asaas_invoice_url: null,
        asaas_bank_slip_url: null,
        asaas_transaction_receipt_url: null,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .in("status", ["PENDENTE", "VENCIDO"]);
    const { data: canceled, error: updateError } =
      await applyRemoteIdentitySnapshot(
        cancelUpdate,
        receivable,
      )
        .select()
        .maybeSingle();
    if (updateError) throw updateError;
    if (!canceled) {
      throw new Error(
        "Cobrança mudou de status antes do cancelamento. Atualize a tela e tente novamente.",
      );
    }

    return respondJson({
      success: true,
      receivable: canceled,
      asaasCanceled,
      asaasDeleteStatus,
      asaasPaymentLinkCanceled,
      asaasPaymentLinkDeleteStatus,
    });
  }

  return null;
}
