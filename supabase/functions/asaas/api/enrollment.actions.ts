import { requireGestorForPolo } from "./authz.ts";
import type { Environment } from "./shared.ts";
import { buildEnrollmentReceivablePaymentPatch, decideEnrollmentPaymentPatch } from "./gateway-routing-guard.ts";
import { applyRemoteIdentitySnapshot, applyReceivableSnapshotFields, hasRemoteTitleReference } from "../../gateways/checkout/remote-title-guard.ts";

import type { AsaasApiContext, AsaasApiResponder } from "./request-context.ts";

export async function handleAsaasEnrollmentAction(action: string, context: AsaasApiContext, respondJson: AsaasApiResponder): Promise<Response | null> {
  const { admin, body, gestor, preflightEnrollmentCharge, getGatewayRuntime, syncReceivable } = context;
  if (action === "sync-enrollment") {
    const matriculaId = String(body.matriculaId || "");
    const { data: matricula, error: matriculaError } = await admin
      .from("matriculas")
      .select(`
          id,
          financeiro_herdado,
          gerar_cobranca_inicial,
          sincronizar_asaas,
          turmas(
            id,
            polo_id,
            origem_financeira,
            financeiro_herdado,
            sincronizar_asaas_futuro
          )
        `)
      .eq("id", matriculaId)
      .maybeSingle();
    if (matriculaError) throw matriculaError;
    if (!matricula) throw new Error("Matrícula não encontrada.");

    const turma = Array.isArray(matricula.turmas)
      ? matricula.turmas[0]
      : matricula.turmas;
    if (gestor) requireGestorForPolo(gestor, turma?.polo_id);
    const origem = String(turma?.origem_financeira || "NORMAL").toUpperCase();
    const financeiroHerdado = matricula.financeiro_herdado === true ||
      turma?.financeiro_herdado === true ||
      origem === "LEGADO";
    const gerarInicial = matricula.gerar_cobranca_inicial ??
      !financeiroHerdado;
    const syncEnabled = matricula.sincronizar_asaas ??
      turma?.sincronizar_asaas_futuro ?? true;

    if (gerarInicial === false) {
      return respondJson({
        success: true,
        skipped: true,
        skippedReason:
          "Cobrança inicial bloqueada por regra de financeiro legado.",
      });
    }

    const paymentPatch = buildEnrollmentReceivablePaymentPatch(
      body.paymentMethod,
    );
    let selectedEnvironment: Environment | null = null;
    if (syncEnabled !== false) {
      const preflight = await preflightEnrollmentCharge(
        String(body.turmaId || turma?.id || ""),
        body.paymentMethod,
      );
      selectedEnvironment =
        preflight.options.find((option) =>
          option.paymentMethod === paymentPatch.gateway_payment_method
        )?.environment || preflight.environment;
    }

    const { data, error } = await admin
      .from("contas_receber")
      .select("*")
      .eq("matricula_id", matriculaId)
      .eq("tipo_lancamento", "MATRICULA")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Cobrança de matrícula não encontrada.");

    const patchDecision = decideEnrollmentPaymentPatch({
      receivable: data,
      requestedMethod: body.paymentMethod,
      hasRemoteReference: hasRemoteTitleReference(data),
    });
    let updatedReceivable = data;
    if (patchDecision === "apply") {
      let updateQuery = admin
        .from("contas_receber")
        .update({
          ...paymentPatch,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("status", data.status);
      updateQuery = data.forma_pagamento === null ||
          data.forma_pagamento === undefined
        ? updateQuery.is("forma_pagamento", null)
        : updateQuery.eq("forma_pagamento", data.forma_pagamento);
      updateQuery = data.gateway_payment_method === null ||
          data.gateway_payment_method === undefined
        ? updateQuery.is("gateway_payment_method", null)
        : updateQuery.eq(
          "gateway_payment_method",
          data.gateway_payment_method,
        );
      updateQuery = applyRemoteIdentitySnapshot(updateQuery, data);
      updateQuery = applyReceivableSnapshotFields(updateQuery, data, [
        "asaas_status",
        "gateway_status",
        "updated_at",
      ]);
      const { data: patchedReceivable, error: updateError } =
        await updateQuery.select().maybeSingle();
      if (updateError) throw updateError;
      if (!patchedReceivable) {
        throw new Error(
          "A cobrança mudou durante a definição do método. Atualize a tela e tente novamente.",
        );
      }
      updatedReceivable = patchedReceivable;
    }

    if (syncEnabled === false) {
      return respondJson({
        success: true,
        receivable: updatedReceivable,
        skipped: true,
        skippedReason:
          "Sincronização no gateway desativada na matrícula/turma.",
      });
    }

    if (String(updatedReceivable.status || "").toUpperCase() === "PAGO") {
      return respondJson({
        success: true,
        receivable: updatedReceivable,
        skipped: true,
        skippedReason: "Cobrança de matrícula já está paga.",
      });
    }

    const runtime = await getGatewayRuntime(selectedEnvironment || undefined);
    const receivable = await syncReceivable(runtime, updatedReceivable.id);
    return respondJson({
      success: true,
      receivable,
      skipped: receivable?.asaas_sync_skipped === true,
      skippedReason: receivable?.asaas_skip_reason || null,
    });
  }

  return null;
}
