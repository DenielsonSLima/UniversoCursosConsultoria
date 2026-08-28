import {
  createGatewayCharge,
  gatewayReceivableUpdate,
  persistGatewayTransaction,
  repairGatewayTransactionFromReceivable,
} from "../gateways/router.ts";
import { resolveBaneseReceivableFinancialTerms } from "../gateways/api/banese-financial-terms.ts";
import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import {
  applyCheckoutAttemptSnapshot,
  claimExistingGatewayCheckout,
} from "../gateways/checkout/gateway-creation-fence.ts";
import { assertGatewayCreationFence } from "../asaas/api/gateway-routing-guard.ts";
import {
  BANESE_INCIDENT_RECEIVABLE_IDS,
  BANESE_INCIDENT_SCOPE,
  type BaneseIncidentRecoveryReport,
  type BaneseIncidentTarget,
  classifyBaneseIncidentRecoveryFailure,
  hasBaneseIncidentMaterialRemoteEvidence,
  isBaneseIncidentDocumentReady,
  isBaneseIncidentReceivable,
  isBaneseIncidentTarget,
  normalizedIncidentStatus,
  normalizedIncidentText,
} from "./incident-recovery-contract.ts";

export {
  BANESE_INCIDENT_RECEIVABLE_IDS,
  BANESE_INCIDENT_SCOPE,
  type BaneseIncidentRecoveryReport,
  classifyBaneseIncidentRecoveryFailure,
  hasBaneseIncidentMaterialRemoteEvidence,
  isBaneseIncidentDocumentReady,
  isBaneseIncidentTarget,
  shouldPauseNormalReconciliationForIncident,
} from "./incident-recovery-contract.ts";

const QUARANTINE_PREFIX = "BANESE_IDENTITY_QUARANTINED:";

export const storedBaneseIncidentFinancialTerms = (
  receivable: Record<string, unknown>,
) => {
  const terms = receivable.gateway_financial_terms;
  return terms && typeof terms === "object" && !Array.isArray(terms)
    ? terms as Awaited<
      ReturnType<typeof resolveBaneseReceivableFinancialTerms>
    >
    : null;
};

type IncidentAdminClient = {
  from: (table: string) => any;
};

const markRecoveryComplete = async (
  admin: IncidentAdminClient,
  receivableId: string,
) => {
  const now = new Date().toISOString();
  const { data, error } = await admin.from("banese_boleto_recovery_targets")
    .update({ completed_at: now, updated_at: now })
    .eq("receivable_id", receivableId)
    .eq("environment", BANESE_INCIDENT_SCOPE.environment)
    .eq("convenio", BANESE_INCIDENT_SCOPE.convenio)
    .eq("agencia", BANESE_INCIDENT_SCOPE.agencia)
    .eq("candidate_start", BANESE_INCIDENT_SCOPE.candidateStart)
    .eq("candidate_end", BANESE_INCIDENT_SCOPE.candidateEnd)
    .in("state", ["RECOVERED", "EXHAUSTED"])
    .is("completed_at", null)
    .select("receivable_id")
    .maybeSingle();
  if (error) throw error;
  if (data?.receivable_id === receivableId) return;

  const { data: current, error: currentError } = await admin
    .from("banese_boleto_recovery_targets")
    .select(
      "receivable_id,environment,convenio,agencia,candidate_start,candidate_end,state,completed_at",
    )
    .eq("receivable_id", receivableId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!isBaneseIncidentTarget(current) || !current.completed_at) {
    throw new Error("Alvo Banese mudou antes de concluir a recuperacao.");
  }
};

const loadReceivable = async (
  admin: IncidentAdminClient,
  receivableId: string,
) => {
  const { data, error } = await admin.from("contas_receber").select("*")
    .eq("id", receivableId).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
};

const finalizeReady = async (
  admin: IncidentAdminClient,
  receivable: Record<string, unknown>,
) => {
  if (!isBaneseIncidentDocumentReady(receivable)) {
    throw new Error("Documento Banese recuperado permanece incompleto.");
  }
  const repaired = await repairGatewayTransactionFromReceivable(
    admin,
    receivable,
  );
  if (!repaired) {
    throw new Error("Transacao Banese recuperada nao pode ser reparada.");
  }
  await markRecoveryComplete(admin, normalizedIncidentText(receivable.id));
};

const reconcileExistingEvidence = async (
  admin: IncidentAdminClient,
  receivable: Record<string, unknown>,
) => {
  if (
    normalizedIncidentStatus(receivable.gateway_submission_status) ===
      "API_REGISTERED"
  ) {
    const repaired = await repairGatewayTransactionFromReceivable(
      admin,
      receivable,
    );
    if (!repaired) {
      throw new Error(
        "Titulo registrado nao possui identidade para auditoria.",
      );
    }
  }
  const reconciliation = await reconcileBaneseReceivable(
    admin,
    normalizedIncidentText(receivable.id),
  );
  if (!isBaneseIncidentDocumentReady(reconciliation.receivable)) {
    throw new Error(
      "Consulta canonica nao completou o documento; nenhum novo POST foi enviado.",
    );
  }
  await finalizeReady(admin, reconciliation.receivable);
  return "RECONCILED" as const;
};

const recoverOne = async (
  admin: IncidentAdminClient,
  supabaseUrl: string,
  target: BaneseIncidentTarget,
) => {
  if (!isBaneseIncidentTarget(target)) {
    throw new Error("Alvo fora do lote fechado de recuperacao Banese.");
  }
  const receivableId = target.receivable_id;
  const receivable = await loadReceivable(admin, receivableId);
  if (!receivable || !isBaneseIncidentReceivable(receivable)) {
    throw new Error("Cobranca fora do contrato de recuperacao Banese.");
  }
  if (isBaneseIncidentDocumentReady(receivable)) {
    await finalizeReady(admin, receivable);
    return "READY" as const;
  }
  if (hasBaneseIncidentMaterialRemoteEvidence(receivable)) {
    return await reconcileExistingEvidence(admin, receivable);
  }
  if (
    !["PENDENTE", "VENCIDO"].includes(
      normalizedIncidentStatus(receivable.status),
    )
  ) {
    throw new Error("Cobranca nao esta elegivel para recuperacao Banese.");
  }

  const { data: payer, error: payerError } = await admin.from("parceiros")
    .select(
      "id,nome,email,cpf_cnpj,telefone,endereco,numero,complemento,cep,bairro,cidade,uf",
    )
    .eq("id", receivable.cliente_id).maybeSingle();
  if (payerError) throw payerError;
  if (!payer) throw new Error("Pagador Banese nao encontrado.");

  const attemptToken = crypto.randomUUID();
  const quarantineError = normalizedIncidentText(
    receivable.gateway_last_error,
  );
  const claimed = await claimExistingGatewayCheckout({
    admin,
    receivable,
    providerCode: "banese_card",
    attemptToken,
    receivablePayload: {
      gateway_provider: "banese_card",
      gateway_environment: BANESE_INCIDENT_SCOPE.environment,
      gateway_payment_method: "BOLETO",
      updated_at: new Date().toISOString(),
    },
  });
  if (!claimed) {
    const current = await loadReceivable(admin, receivableId);
    if (!current || !isBaneseIncidentReceivable(current)) {
      throw new Error("Cobranca mudou durante a recuperacao Banese.");
    }
    if (isBaneseIncidentDocumentReady(current)) {
      await finalizeReady(admin, current);
      return "READY" as const;
    }
    if (hasBaneseIncidentMaterialRemoteEvidence(current)) {
      return await reconcileExistingEvidence(admin, current);
    }
    return "BUSY" as const;
  }

  let remoteResult: Awaited<ReturnType<typeof createGatewayCharge>> | null =
    null;
  try {
    // Estes 13 títulos já possuíam o pedido financeiro canônico antes da
    // quarentena. Preservá-lo é obrigatório para consultar/recuperar a mesma
    // cobrança bancária; só calculamos um novo snapshot quando ele não existe.
    const financialTerms = storedBaneseIncidentFinancialTerms(claimed) ??
      await resolveBaneseReceivableFinancialTerms(admin, claimed);
    remoteResult = await createGatewayCharge({
      admin,
      supabaseUrl,
      providerCode: "banese_card",
      environment: BANESE_INCIDENT_SCOPE.environment,
      paymentMethod: "BOLETO",
      receivable: claimed,
      payer: {
        id: payer.id,
        name: payer.nome,
        nome: payer.nome,
        email: payer.email,
        document: payer.cpf_cnpj,
        cpfCnpj: payer.cpf_cnpj,
        phone: payer.telefone,
        endereco: payer.endereco,
        numero: payer.numero,
        complemento: payer.complemento,
        cep: payer.cep,
        bairro: payer.bairro,
        cidade: payer.cidade,
        uf: payer.uf,
      },
      amount: Number(claimed.valor),
      description: normalizedIncidentText(
        claimed.descricao || "Cobranca Universo Cursos",
      ),
      dueDate: normalizedIncidentText(claimed.data_vencimento),
      successUrl: "https://universocc.com.br/aluno?module=financeiro",
      failureUrl: "https://universocc.com.br/aluno?module=financeiro",
      pendingUrl: "https://universocc.com.br/aluno?module=financeiro",
      financialTerms,
    });
    const postCreate = await loadReceivable(admin, receivableId);
    if (!postCreate) throw new Error("Cobranca desapareceu apos o registro.");
    assertGatewayCreationFence({
      receivable: postCreate,
      providerCode: "banese_card",
      environment: BANESE_INCIDENT_SCOPE.environment,
      paymentMethod: "BOLETO",
      attemptToken,
      expectedBankSlipOurNumber: remoteResult.bankSlipOurNumber,
    });

    let update = admin.from("contas_receber").update({
      ...gatewayReceivableUpdate({
        providerCode: "banese_card",
        environment: BANESE_INCIDENT_SCOPE.environment,
        paymentMethod: "BOLETO",
        result: remoteResult,
      }),
      gateway_creation_token: null,
      gateway_submission_channel: "API",
      gateway_submission_status: "API_REGISTERED",
      origem_pagamento: "BANESE",
    }).eq("id", receivableId).eq("gateway_creation_token", attemptToken)
      .eq("gateway_status", "CREATING")
      .in("status", ["PENDENTE", "VENCIDO"]);
    update = applyCheckoutAttemptSnapshot(update, postCreate);
    const { data: persisted, error: persistError } = await update.select()
      .maybeSingle();
    if (persistError) throw persistError;
    if (!persisted) throw new Error("Cobranca mudou antes da persistencia.");
    await persistGatewayTransaction(admin, {
      receivable: persisted,
      providerCode: "banese_card",
      environment: BANESE_INCIDENT_SCOPE.environment,
      paymentMethod: "BOLETO",
      amount: Number(persisted.valor),
      result: remoteResult,
    });
    if (isBaneseIncidentDocumentReady(persisted)) {
      await finalizeReady(admin, persisted);
      return "RECOVERED" as const;
    }
    return await reconcileExistingEvidence(admin, persisted);
  } catch (error) {
    const current = await loadReceivable(admin, receivableId);
    if (current && isBaneseIncidentReceivable(current)) {
      if (isBaneseIncidentDocumentReady(current)) {
        await finalizeReady(admin, current);
        return "READY" as const;
      }
      if (hasBaneseIncidentMaterialRemoteEvidence(current)) {
        return await reconcileExistingEvidence(admin, current);
      }
    }

    const remotePaymentMayExist = Boolean(
      remoteResult ||
        (error && typeof error === "object" &&
          (error as Record<string, unknown>).remotePaymentCreated === true),
    );
    let stateUpdate = admin.from("contas_receber").update({
      gateway_status: remotePaymentMayExist ? "CREATING" : null,
      gateway_creation_token: remotePaymentMayExist ? attemptToken : null,
      gateway_last_error: remotePaymentMayExist
        ? "BANESE_INCIDENT_API_AMBIGUOUS: conciliacao automatica pendente."
        : (quarantineError.startsWith(QUARANTINE_PREFIX)
          ? quarantineError
          : `${QUARANTINE_PREFIX} consulta automatica pendente.`),
      ...(remotePaymentMayExist
        ? {
          gateway_submission_channel: "API",
          gateway_submission_status: "API_AMBIGUOUS",
        }
        : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", receivableId).eq("gateway_creation_token", attemptToken)
      .eq("gateway_status", "CREATING")
      .eq("gateway_provider", "banese_card")
      .eq("gateway_environment", BANESE_INCIDENT_SCOPE.environment)
      .eq("gateway_payment_method", "BOLETO")
      .in("status", ["PENDENTE", "VENCIDO"]);
    stateUpdate = applyCheckoutAttemptSnapshot(stateUpdate, current || claimed);
    const { data: preserved, error: preserveError } = await stateUpdate
      .select("*").maybeSingle();
    if (preserveError || !preserved) {
      const stateError = new Error(
        "Falha ao preservar atomicamente a tentativa de recuperacao Banese.",
        { cause: preserveError || error },
      );
      (stateError as Error & { remotePaymentCreated?: boolean })
        .remotePaymentCreated = remotePaymentMayExist;
      throw stateError;
    }
    if (remotePaymentMayExist) {
      try {
        return await reconcileExistingEvidence(admin, preserved);
      } catch {
        // API_AMBIGUOUS e token ficam preservados para a proxima execucao.
      }
    }
    throw error;
  }
};

export const recoverBaneseIncidentBatch = async (
  admin: IncidentAdminClient,
  supabaseUrl: string,
  limit = BANESE_INCIDENT_SCOPE.maxTargets,
): Promise<BaneseIncidentRecoveryReport> => {
  const parsedLimit = Number.isSafeInteger(Number(limit))
    ? Number(limit)
    : BANESE_INCIDENT_SCOPE.maxTargets;
  const safeLimit = Math.max(
    1,
    Math.min(BANESE_INCIDENT_SCOPE.maxTargets, parsedLimit),
  );
  const { data: targets, error } = await admin
    .from("banese_boleto_recovery_targets")
    .select(
      "receivable_id,environment,convenio,agencia,candidate_start,candidate_end,state,completed_at",
    )
    .in("receivable_id", [...BANESE_INCIDENT_RECEIVABLE_IDS])
    .eq("environment", BANESE_INCIDENT_SCOPE.environment)
    .eq("convenio", BANESE_INCIDENT_SCOPE.convenio)
    .eq("agencia", BANESE_INCIDENT_SCOPE.agencia)
    .eq("candidate_start", BANESE_INCIDENT_SCOPE.candidateStart)
    .eq("candidate_end", BANESE_INCIDENT_SCOPE.candidateEnd)
    .is("completed_at", null)
    .order("receivable_id", { ascending: true })
    .limit(safeLimit);
  if (error) throw error;

  const report: BaneseIncidentRecoveryReport = {
    processed: 0,
    ready: 0,
    recovered: 0,
    reconciled: 0,
    busy: 0,
    failed: 0,
  };
  for (const rawTarget of Array.isArray(targets) ? targets : []) {
    report.processed += 1;
    if (!isBaneseIncidentTarget(rawTarget)) {
      report.failed += 1;
      continue;
    }
    try {
      const result = await recoverOne(admin, supabaseUrl, rawTarget);
      if (result === "BUSY") report.busy += 1;
      else {
        report.ready += 1;
        if (result === "RECOVERED") report.recovered += 1;
        if (result === "RECONCILED") report.reconciled += 1;
      }
    } catch (error) {
      console.error("banese incident target failed", {
        failureCode: classifyBaneseIncidentRecoveryFailure(error),
      });
      report.failed += 1;
    }
  }
  return report;
};
