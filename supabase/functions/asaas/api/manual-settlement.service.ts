import {
  assertMercadoPagoManualSettlementAllowed,
  assertNoActiveCnabSubmission,
  hasRemoteTitleReference,
} from "../../gateways/checkout/remote-title-guard.ts";
import {
  dependencyBillingSnapshotFrom,
  DEPENDENCY_BILLING_DAYS_TO_WRITE_OFF,
  isDependencyReceivable,
} from "../../banese/internal/dependency-billing.ts";
import { RemoteCancellationPreflightError } from "../../gateways/api/remote-cancellation-errors.ts";
import { syncManualSettlementAcademicEffects } from "./manual-settlement-academic.ts";
import {
  manualSettlementFingerprint,
  normalizeManualSettlementRequest,
} from "./manual-settlement-money.ts";
import {
  createManualSettlementRepository,
  manualSettlementReceivableSnapshot,
} from "./manual-settlement.repository.ts";
import {
  assertNoKnownRemotePayment,
  cancelRemoteTitleBeforeManualSettlement,
} from "./manual-settlement-remote.ts";
import type {
  ManualSettlementAttempt,
  ManualSettlementResult,
  ManualSettlementServiceDependencies,
  NormalizedManualSettlementRequest,
} from "./manual-settlement.types.ts";

const LEASE_MILLISECONDS = 2 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const duplicateKeyError = (error: any) => String(error?.code || "") === "23505";

const createLeaseToken = (
  dependencies: ManualSettlementServiceDependencies,
) => dependencies.leaseToken ? dependencies.leaseToken() : crypto.randomUUID();

const attemptLeaseIsActive = (attempt: ManualSettlementAttempt, now: Date) =>
  Boolean(
    attempt.lease_token && attempt.lease_expires_at &&
      new Date(attempt.lease_expires_at).getTime() > now.getTime(),
  );

const assertAttemptMatchesRequest = (
  attempt: ManualSettlementAttempt,
  actorId: string,
  request: NormalizedManualSettlementRequest,
  fingerprint: string,
) => {
  if (
    attempt.actor_id !== actorId ||
    attempt.receivable_id !== request.receivableId ||
    attempt.request_fingerprint !== fingerprint
  ) {
    throw new Error(
      "A chave idempotente já foi usada com outros dados. Feche e abra a baixa novamente.",
    );
  }
};

const providerCodeFor = (receivable: any) =>
  String(receivable?.gateway_provider || "").trim().toLowerCase() ||
  (receivable?.asaas_payment_id || receivable?.asaas_payment_link_id
    ? "asaas"
    : null);

const utcDay = (value: unknown, label: string) => {
  const iso = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`${label} inválida para a cobrança da disciplina.`);
  }
  const [year, month, day] = iso.split("-").map(Number);
  const instant = Date.UTC(year, month - 1, day);
  if (
    !Number.isFinite(instant) ||
    new Date(instant).toISOString().slice(0, 10) !== iso
  ) {
    throw new Error(`${label} inválida para a cobrança da disciplina.`);
  }
  return instant;
};

/**
 * A baixa presencial precisa obedecer à mesma janela enviada ao Banese. A
 * validação ocorre antes de cancelar o título remoto, evitando deixá-lo
 * cancelado caso a baixa local seja fora dos 60 dias.
 */
const assertDependencyManualSettlementWindow = (
  receivable: any,
  paymentDate: string,
  now = new Date(),
) => {
  if (!isDependencyReceivable(receivable)) return;
  const snapshot = dependencyBillingSnapshotFrom(
    receivable?.regra_financeira_dependencia_snapshot,
  );
  // Dependências legadas seguem o contrato antigo. Toda cobrança nova possui
  // o snapshot, que é a fonte canônica desta regra.
  if (!snapshot) return;

  if (
    Number(snapshot.diasBaixaDevolucao) !==
      DEPENDENCY_BILLING_DAYS_TO_WRITE_OFF
  ) {
    throw new Error(
      "Os termos da cobrança da disciplina não possuem o prazo bancário obrigatório de 60 dias.",
    );
  }

  const dueDay = utcDay(receivable?.data_vencimento, "Vencimento");
  const paidDay = utcDay(paymentDate, "Data de pagamento");
  const lastPayableDay = dueDay +
    DEPENDENCY_BILLING_DAYS_TO_WRITE_OFF * 24 * 60 * 60 * 1000;
  const operationDay = utcDay(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Maceio",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    "Data da operação",
  );
  if (paidDay > lastPayableDay || operationDay > lastPayableDay) {
    throw new Error(
      "A cobrança da disciplina não pode receber baixa após 60 dias do vencimento.",
    );
  }
};

const attemptInput = (
  request: NormalizedManualSettlementRequest,
  fingerprint: string,
  actorId: string,
  receivable: any,
  leaseToken: string,
  leaseExpiresAt: string,
) => ({
  idempotency_key: request.idempotencyKey,
  request_fingerprint: fingerprint,
  receivable_id: request.receivableId,
  actor_id: actorId,
  polo_id: receivable.polo_id || null,
  account_id: request.accountId,
  payment_date: request.paymentDate,
  payment_method: request.paymentMethod,
  principal_cents: request.breakdown.principalCents,
  interest_cents: request.breakdown.interestCents,
  penalty_cents: request.breakdown.penaltyCents,
  addition_cents: request.breakdown.additionCents,
  discount_cents: request.breakdown.discountCents,
  received_cents: request.breakdown.receivedCents,
  provider_code: providerCodeFor(receivable),
  environment: receivable.gateway_environment || null,
  remote_payment_id: receivable.gateway_payment_id ||
    receivable.asaas_payment_id || null,
  remote_payment_link_id: receivable.gateway_payment_link_id ||
    receivable.asaas_payment_link_id || null,
  requires_remote_cancellation: hasRemoteTitleReference(receivable),
  receivable_snapshot: manualSettlementReceivableSnapshot(receivable),
  state: "STARTED",
  lease_token: leaseToken,
  lease_expires_at: leaseExpiresAt,
});

const accountForSettlement = async (
  admin: any,
  accountId: string,
  receivable: any,
) => {
  const { data, error } = await admin
    .from("contas_bancarias")
    .select("id, polo_id, ativo")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.ativo !== true) {
    throw new Error("Conta bancária inativa ou não encontrada.");
  }
  if (
    receivable.polo_id && data.polo_id &&
    data.polo_id !== receivable.polo_id
  ) {
    throw new Error("Conta bancária pertence a outro polo.");
  }
  return data;
};

const completedReplay = async (
  dependencies: ManualSettlementServiceDependencies,
  attempt: ManualSettlementAttempt,
): Promise<ManualSettlementResult> => {
  const result = {
    ...(attempt.result || {}),
    success: true,
    settlementId: attempt.id,
    replayed: true,
  } as ManualSettlementResult;
  try {
    await (dependencies.repository ??
      createManualSettlementRepository(dependencies.admin)).appendEvent(
        attempt.id,
        dependencies.actor.id,
        "LOCAL_SETTLEMENT_REPLAYED",
        { idempotencyKey: attempt.idempotency_key },
      );
  } catch (error) {
    console.error("Falha ao auditar replay de baixa manual:", error);
  }
  return result;
};

const resolveAttempt = async (
  dependencies: ManualSettlementServiceDependencies,
  request: NormalizedManualSettlementRequest,
  fingerprint: string,
  receivable: any,
  now: Date,
) => {
  const repository = dependencies.repository ??
    createManualSettlementRepository(dependencies.admin);
  const current = await repository.getAttemptByIdempotencyKey(
    request.idempotencyKey,
  );
  if (current) {
    assertAttemptMatchesRequest(
      current,
      dependencies.actor.id,
      request,
      fingerprint,
    );
    if (current.state === "COMPLETED") {
      return {
        attempt: current,
        replay: await completedReplay(dependencies, current),
      };
    }
    if (current.state === "REVIEW_REQUIRED") {
      throw new Error(
        `Esta baixa está bloqueada para revisão manual: ${
          current.last_error ||
          "confira o título no provedor antes de continuar."
        }`,
      );
    }
    if (current.state === "REVERSED") {
      throw new Error(
        "Esta tentativa já foi estornada. Feche e abra uma nova baixa para gerar outra chave idempotente.",
      );
    }
    if (attemptLeaseIsActive(current, now)) {
      throw new Error(
        "Esta baixa já está sendo processada. Aguarde a conclusão antes de tentar novamente.",
      );
    }
    const leaseToken = createLeaseToken(dependencies);
    const claimed = await repository.claimAttempt(
      current,
      leaseToken,
      new Date(now.getTime() + LEASE_MILLISECONDS).toISOString(),
    );
    if (!claimed) {
      throw new Error(
        "Outra requisição retomou esta baixa. Atualize a tela antes de continuar.",
      );
    }
    return { attempt: claimed, replay: null };
  }

  if (
    !["PENDENTE", "VENCIDO"].includes(
      String(receivable.status || "").toUpperCase(),
    )
  ) {
    throw new Error(
      "Baixa manual permitida apenas para cobranças pendentes ou vencidas.",
    );
  }
  assertDependencyManualSettlementWindow(receivable, request.paymentDate, now);
  assertNoKnownRemotePayment(receivable);
  assertNoActiveCnabSubmission(receivable);
  assertMercadoPagoManualSettlementAllowed(receivable);
  await accountForSettlement(dependencies.admin, request.accountId, receivable);

  const leaseToken = createLeaseToken(dependencies);
  const leaseExpiresAt = new Date(
    now.getTime() + LEASE_MILLISECONDS,
  ).toISOString();
  let attempt: ManualSettlementAttempt;
  try {
    attempt = await repository.createAttempt(attemptInput(
      request,
      fingerprint,
      dependencies.actor.id,
      receivable,
      leaseToken,
      leaseExpiresAt,
    ));
  } catch (error) {
    if (!duplicateKeyError(error)) throw error;
    const duplicate = await repository.getAttemptByIdempotencyKey(
      request.idempotencyKey,
    );
    if (duplicate) {
      assertAttemptMatchesRequest(
        duplicate,
        dependencies.actor.id,
        request,
        fingerprint,
      );
      throw new Error(
        "Esta baixa já foi iniciada por outra requisição. Atualize a tela para acompanhar o resultado.",
        { cause: error },
      );
    }
    const active = await repository.getActiveAttempt(request.receivableId);
    throw new Error(
      active?.state === "REVIEW_REQUIRED"
        ? "A cobrança possui uma baixa anterior em revisão manual. Regularize-a antes de iniciar outra."
        : "A cobrança já possui outra baixa em processamento.",
      { cause: error },
    );
  }

  await repository.appendEvent(
    attempt.id,
    dependencies.actor.id,
    "STARTED",
    {
      receivableId: request.receivableId,
      idempotencyKey: request.idempotencyKey,
      currency: "BRL",
      receivedCents: request.breakdown.receivedCents,
    },
  );
  return { attempt, replay: null };
};

const syncFutureCharges = async (
  dependencies: ManualSettlementServiceDependencies,
  receivable: any,
  result: ManualSettlementResult,
) => {
  if (!receivable.matricula_id || !dependencies.syncFutureInstallments) {
    return result;
  }
  let warning: string | null = null;
  try {
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

export const settleReceivableManually = async (
  dependencies: ManualSettlementServiceDependencies,
): Promise<ManualSettlementResult> => {
  const repository = dependencies.repository ??
    createManualSettlementRepository(dependencies.admin);
  const now = (dependencies.now ?? (() => new Date()))();
  const receivableId = String(dependencies.body.receivableId || "").trim();
  if (!UUID_RE.test(receivableId)) {
    throw new Error("Cobrança inválida para baixa manual.");
  }
  const receivable = await repository.getReceivable(receivableId);
  dependencies.requirePoloAccess(
    dependencies.actor,
    receivable.polo_id || null,
  );
  const request = normalizeManualSettlementRequest(
    dependencies.body,
    receivable,
    now,
  );
  const fingerprint = await manualSettlementFingerprint(request);
  const { attempt: resolvedAttempt, replay } = await resolveAttempt(
    dependencies,
    request,
    fingerprint,
    receivable,
    now,
  );
  if (replay) {
    if (replay.academicSyncCompleted === true) {
      return await syncFutureCharges(dependencies, receivable, replay);
    }
    const projected = await syncManualSettlementAcademicEffects(
      dependencies,
      request,
      replay,
    );
    return await syncFutureCharges(
      dependencies,
      projected.receivable,
      projected.result,
    );
  }

  let attempt = resolvedAttempt;
  const leaseToken = String(attempt.lease_token || "");
  if (!leaseToken) {
    throw new Error(
      "Tentativa de baixa sem posse idempotente de processamento.",
    );
  }

  if (attempt.state !== "REMOTE_CANCELED_LOCAL_PENDING") {
    try {
      const remote = await cancelRemoteTitleBeforeManualSettlement(
        dependencies,
        receivable,
      );
      attempt = await repository.markRemoteReady(attempt.id, leaseToken, {
        provider_code: remote.providerCode,
        environment: remote.environment,
        remote_payment_id: remote.remotePaymentId,
        remote_payment_link_id: remote.remotePaymentLinkId,
        requires_remote_cancellation: remote.required,
        remote_canceled_at: remote.required ? new Date().toISOString() : null,
        receivable_snapshot: manualSettlementReceivableSnapshot(
          remote.receivable,
        ),
      });
      if (remote.required) {
        await repository.appendEvent(
          attempt.id,
          dependencies.actor.id,
          "REMOTE_CANCELED",
          {
            providerCode: remote.providerCode,
            environment: remote.environment,
            remotePaymentId: remote.remotePaymentId,
            remotePaymentLinkId: remote.remotePaymentLinkId,
          },
        );
      }
    } catch (error) {
      const message = errorMessage(error);
      if (error instanceof RemoteCancellationPreflightError) {
        await repository.markSafeFailure(attempt.id, leaseToken, message);
        await repository.appendEvent(
          attempt.id,
          dependencies.actor.id,
          "REMOTE_CANCELLATION_PREFLIGHT_FAILED",
          { error: message.slice(0, 1000) },
        );
        throw new Error(
          `Baixa local não registrada. O banco não foi chamado: ${message}`,
          { cause: error },
        );
      }
      await repository.markReviewRequired(attempt.id, leaseToken, message);
      await repository.appendEvent(
        attempt.id,
        dependencies.actor.id,
        "REMOTE_CANCELLATION_FAILED",
        { error: message.slice(0, 1000) },
      );
      throw new Error(
        `Baixa local não registrada. O cancelamento bancário exige revisão manual: ${message}`,
        { cause: error },
      );
    }
  }

  let result: ManualSettlementResult;
  try {
    result = await repository.finalize(attempt.id, leaseToken);
  } catch (error) {
    const message = errorMessage(error);
    await repository.markReviewRequired(attempt.id, leaseToken, message);
    await repository.appendEvent(
      attempt.id,
      dependencies.actor.id,
      "LOCAL_SETTLEMENT_FAILED",
      { error: message.slice(0, 1000) },
    );
    throw new Error(
      `A baixa não foi consolidada e ficou em revisão manual: ${message}`,
      { cause: error },
    );
  }

  const projected = await syncManualSettlementAcademicEffects(
    dependencies,
    request,
    result,
  );
  return await syncFutureCharges(
    dependencies,
    projected.receivable,
    projected.result,
  );
};
