import assert from "node:assert/strict";
import {
  manualSettlementFingerprint,
  normalizeManualSettlementRequest,
} from "./manual-settlement-money.ts";
import { settleReceivableManually } from "./manual-settlement.service.ts";
import { RemoteCancellationPreflightError } from "../../gateways/api/remote-cancellation-errors.ts";
import type {
  ManualSettlementAttempt,
  ManualSettlementRepository,
  ManualSettlementResult,
} from "./manual-settlement.types.ts";
import type { GestorAutorizado } from "./authz.ts";

const RECEIVABLE_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_KEY = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";
const POLO_ID = "66666666-6666-4666-8666-666666666666";
const ENROLLMENT_ID = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-07-22T15:00:00.000Z");

const receivable = {
  id: RECEIVABLE_ID,
  polo_id: POLO_ID,
  status: "PENDENTE",
  valor: "100.00",
  gateway_provider: null,
  gateway_environment: null,
  gateway_payment_method: null,
  gateway_payment_id: null,
  gateway_payment_link_id: null,
  gateway_boleto_nosso_numero: null,
  gateway_status: null,
  asaas_payment_id: null,
  asaas_payment_link_id: null,
  asaas_status: null,
  matricula_id: null,
};

const body = {
  receivableId: RECEIVABLE_ID,
  idempotencyKey: ATTEMPT_KEY,
  contaBancariaId: ACCOUNT_ID,
  dataPagamento: "2026-07-22",
  formaPagamento: "DINHEIRO",
  valorPago: "100,00",
  valorJuros: "0",
  valorMulta: "0",
  valorDesconto: "0",
  valorAcrescimo: "0",
};

const actor: GestorAutorizado = {
  id: ACTOR_ID,
  email: "financeiro@example.com",
  perfil: "financeiro",
  status: "ativo",
  context: POLO_ID,
  isGlobal: false,
  poloId: POLO_ID,
  poloIds: [POLO_ID],
  modules: ["financeiro"],
  financeiroTabs: ["receber"],
  tabs: { financeiro: ["receber"] },
  communicationSector: "",
  communicationPoloId: null,
  canViewAllCommunication: false,
  canViewAllCommunicationPolos: false,
};

const fakeAdmin = () => ({
  from(table: string) {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      neq: () => builder,
      update: () => builder,
      maybeSingle: async () =>
        table === "contas_bancarias"
          ? {
            data: { id: ACCOUNT_ID, polo_id: POLO_ID, ativo: true },
            error: null,
          }
          : { data: null, error: null },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return builder;
  },
});

const attemptFrom = (
  input: Record<string, unknown>,
): ManualSettlementAttempt => ({
  id: ATTEMPT_ID,
  idempotency_key: ATTEMPT_KEY,
  request_fingerprint: String(input.request_fingerprint || ""),
  receivable_id: RECEIVABLE_ID,
  actor_id: ACTOR_ID,
  polo_id: POLO_ID,
  account_id: ACCOUNT_ID,
  payment_date: "2026-07-22",
  payment_method: "DINHEIRO",
  principal_cents: 10_000,
  interest_cents: 0,
  penalty_cents: 0,
  addition_cents: 0,
  discount_cents: 0,
  received_cents: 10_000,
  provider_code: null,
  environment: null,
  remote_payment_id: null,
  remote_payment_link_id: null,
  requires_remote_cancellation: false,
  remote_canceled_at: null,
  receivable_snapshot: {},
  state: "STARTED",
  lease_token: String(
    input.lease_token || "77777777-7777-4777-8777-777777777777",
  ),
  lease_expires_at: String(
    input.lease_expires_at || "2026-07-22T15:02:00.000Z",
  ),
  review_required_at: null,
  completed_at: null,
  reversed_at: null,
  last_error: null,
  result: {},
  created_at: "2026-07-22T15:00:00.000Z",
  updated_at: "2026-07-22T15:00:00.000Z",
  ...input,
} as ManualSettlementAttempt);

const fakeRepository = (options: {
  currentReceivable?: any;
  existingAttempt?: ManualSettlementAttempt | null;
  finalizeError?: Error;
} = {}) => {
  let attempt = options.existingAttempt || null;
  let settled = options.existingAttempt?.state === "COMPLETED";
  const events: string[] = [];
  let reviewError: string | null = null;
  let safeError: string | null = null;
  let finalizeCalls = 0;
  const result: ManualSettlementResult = {
    success: true,
    settlementId: ATTEMPT_ID,
    gatewayCanceled: false,
    gatewayProvider: null,
  };
  const repository: ManualSettlementRepository = {
    getReceivable: async () => {
      const current = options.currentReceivable || receivable;
      return settled
        ? {
          ...current,
          status: "PAGO",
          data_pagamento: "2026-07-22",
          forma_pagamento: "DINHEIRO",
        }
        : current;
    },
    getAttemptByIdempotencyKey: async () => attempt,
    getActiveAttempt: async () => attempt,
    createAttempt: async (input) => {
      attempt = attemptFrom(input);
      return attempt;
    },
    claimAttempt: async (current, token, expires) => {
      attempt = {
        ...current,
        state: current.state === "FAILED_SAFE" ? "STARTED" : current.state,
        lease_token: token,
        lease_expires_at: expires,
        last_error: null,
      };
      return attempt;
    },
    markRemoteReady: async (_id, _token, input) => {
      attempt = {
        ...attempt!,
        ...input,
        state: "REMOTE_CANCELED_LOCAL_PENDING",
      } as ManualSettlementAttempt;
      return attempt;
    },
    markReviewRequired: async (_id, _token, error) => {
      reviewError = error;
      attempt = {
        ...attempt!,
        state: "REVIEW_REQUIRED",
        last_error: error,
      };
    },
    markSafeFailure: async (_id, _token, error) => {
      safeError = error;
      attempt = {
        ...attempt!,
        state: "FAILED_SAFE",
        lease_token: null,
        lease_expires_at: null,
        last_error: error,
      };
    },
    appendEvent: async (_id, _actor, event) => {
      events.push(event);
    },
    finalize: async () => {
      finalizeCalls += 1;
      if (options.finalizeError) throw options.finalizeError;
      settled = true;
      attempt = {
        ...attempt!,
        state: "COMPLETED",
        result: result as unknown as Record<string, unknown>,
      };
      return result;
    },
    updateCompletedResult: async (_id, updatedResult) => {
      attempt = {
        ...attempt!,
        result: updatedResult as unknown as Record<string, unknown>,
      };
    },
    setFutureSyncError: async () => {},
  };
  return {
    repository,
    events,
    get reviewError() {
      return reviewError;
    },
    get safeError() {
      return safeError;
    },
    get finalizeCalls() {
      return finalizeCalls;
    },
  };
};

const dependencies = (
  repository: ManualSettlementRepository,
  currentBody: Record<string, unknown> = body,
) => ({
  admin: fakeAdmin(),
  actor,
  body: currentBody,
  requirePoloAccess: (_actor: GestorAutorizado, poloId: string | null) => {
    assert.equal(poloId, POLO_ID);
  },
  getAsaasRuntime: async () => ({
    environment: "sandbox" as const,
    baseUrl: "https://sandbox.example",
    apiKey: "test",
  }),
  repository,
  now: () => NOW,
  leaseToken: () => "77777777-7777-4777-8777-777777777777",
});

Deno.test("baixa local persiste composição e finaliza uma única vez", async () => {
  const fake = fakeRepository();
  const result = await settleReceivableManually(dependencies(fake.repository));
  assert.equal(result.success, true);
  assert.equal(fake.finalizeCalls, 1);
  assert.deepEqual(fake.events, ["STARTED"]);
});

Deno.test("gera lease token padrão com crypto.randomUUID vinculado ao runtime", async () => {
  const fake = fakeRepository();
  const { leaseToken: _injectedLeaseToken, ...runtimeDependencies } =
    dependencies(fake.repository);

  const result = await settleReceivableManually(runtimeDependencies);

  assert.equal(result.success, true);
  assert.equal(fake.finalizeCalls, 1);
});

Deno.test("replay concluído não cancela nem consolida novamente", async () => {
  const request = normalizeManualSettlementRequest(body, receivable, NOW);
  const fingerprint = await manualSettlementFingerprint(request);
  const completed = {
    ...attemptFrom({ request_fingerprint: fingerprint }),
    state: "COMPLETED" as const,
    lease_token: null,
    lease_expires_at: null,
    result: { success: true, settlementId: ATTEMPT_ID },
  };
  const fake = fakeRepository({ existingAttempt: completed });
  const result = await settleReceivableManually(dependencies(fake.repository));
  assert.equal(result.replayed, true);
  assert.equal(fake.finalizeCalls, 0);
  assert.deepEqual(fake.events, ["LOCAL_SETTLEMENT_REPLAYED"]);
});

Deno.test("falha remota Banese deixa revisão e nunca marca PAGO", async () => {
  const banese = {
    ...receivable,
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "000000015",
    gateway_boleto_nosso_numero: "000000015",
    gateway_status: "PENDING",
  };
  const fake = fakeRepository({ currentReceivable: banese });
  await assert.rejects(
    () =>
      settleReceivableManually({
        ...dependencies(fake.repository),
        cancelBanese: async () => {
          throw new Error("Banese indisponível");
        },
      }),
    /não registrada.*revisão manual.*Banese indisponível/i,
  );
  assert.match(fake.reviewError || "", /Banese indisponível/);
  assert.equal(fake.finalizeCalls, 0);
  assert.deepEqual(fake.events, ["STARTED", "REMOTE_CANCELLATION_FAILED"]);
});

Deno.test("falha anterior à chamada Banese não bloqueia uma nova tentativa", async () => {
  const banese = {
    ...receivable,
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "15x",
    gateway_boleto_nosso_numero: "000000015",
    gateway_status: "PENDING",
  };
  const fake = fakeRepository({ currentReceivable: banese });

  await assert.rejects(
    () =>
      settleReceivableManually({
        ...dependencies(fake.repository),
        cancelBanese: async () => {
          throw new RemoteCancellationPreflightError(
            "Nosso Numero Banese invalido para baixa manual.",
          );
        },
      }),
    /banco não foi chamado.*Nosso Numero Banese invalido/i,
  );

  assert.match(fake.safeError || "", /Nosso Numero Banese invalido/i);
  assert.equal(fake.reviewError, null);
  assert.equal(fake.finalizeCalls, 0);
  assert.deepEqual(fake.events, [
    "STARTED",
    "REMOTE_CANCELLATION_PREFLIGHT_FAILED",
  ]);
});

Deno.test("a mesma chave pode retomar uma tentativa FAILED_SAFE", async () => {
  const request = normalizeManualSettlementRequest(body, receivable, NOW);
  const fingerprint = await manualSettlementFingerprint(request);
  const failedSafe = {
    ...attemptFrom({ request_fingerprint: fingerprint }),
    state: "FAILED_SAFE" as const,
    lease_token: null,
    lease_expires_at: null,
    last_error: "falha anterior segura",
  };
  const fake = fakeRepository({ existingAttempt: failedSafe });

  const result = await settleReceivableManually(dependencies(fake.repository));

  assert.equal(result.success, true);
  assert.equal(fake.finalizeCalls, 1);
});

Deno.test("status bancário pago bloqueia antes de criar tentativa", async () => {
  const fake = fakeRepository({
    currentReceivable: { ...receivable, gateway_status: "PAID" },
  });
  await assert.rejects(
    () => settleReceivableManually(dependencies(fake.repository)),
    /já registrou pagamento/i,
  );
  assert.equal(fake.finalizeCalls, 0);
  assert.deepEqual(fake.events, []);
});

Deno.test("falha CAS após cancelamento fica em revisão e não simula sucesso", async () => {
  const fake = fakeRepository({ finalizeError: new Error("status mudou") });
  await assert.rejects(
    () => settleReceivableManually(dependencies(fake.repository)),
    /não foi consolidada.*revisão manual/i,
  );
  assert.equal(fake.finalizeCalls, 1);
  assert.match(fake.reviewError || "", /status mudou/);
  assert.deepEqual(fake.events, ["STARTED", "LOCAL_SETTLEMENT_FAILED"]);
});

Deno.test("canal CNAB Banese falha fechado sem chamar cancelador API", async () => {
  const cnab = {
    ...receivable,
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_boleto_nosso_numero: "000000015",
    gateway_submission_channel: "CNAB",
    gateway_submission_status: "CNAB_GENERATED",
  };
  const fake = fakeRepository({ currentReceivable: cnab });
  let cancelCalled = false;
  await assert.rejects(
    () =>
      settleReceivableManually({
        ...dependencies(fake.repository),
        cancelBanese: async () => {
          cancelCalled = true;
          throw new Error("não chamar");
        },
      }),
    /canal CNAB/i,
  );
  assert.equal(cancelCalled, false);
  assert.deepEqual(fake.events, []);
});

Deno.test("dependência avulsa bloqueia baixa presencial após 60 dias antes de cancelar o boleto", async () => {
  const isolatedDependency = {
    ...receivable,
    tipo_lancamento: "DEPENDENCIA",
    data_vencimento: "2026-05-20",
    regra_financeira_dependencia_snapshot: {
      origem: "DEPENDENCIA",
      diasBaixaDevolucao: 60,
    },
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "000000015",
    gateway_boleto_nosso_numero: "000000015",
    gateway_status: "PENDING",
  };
  const fake = fakeRepository({ currentReceivable: isolatedDependency });
  let cancelCalled = false;

  await assert.rejects(
    () => settleReceivableManually({
      ...dependencies(fake.repository),
      cancelBanese: async () => {
        cancelCalled = true;
        throw new Error("não deveria cancelar");
      },
    }),
    /não pode receber baixa após 60 dias/i,
  );

  assert.equal(cancelCalled, false);
  assert.equal(fake.finalizeCalls, 0);
  assert.deepEqual(fake.events, []);
});

Deno.test("dependência bloqueia baixa retrodatada iniciada depois da janela bancária", async () => {
  const isolatedDependency = {
    ...receivable,
    tipo_lancamento: "DEPENDENCIA",
    data_vencimento: "2026-05-20",
    regra_financeira_dependencia_snapshot: {
      origem: "DEPENDENCIA",
      diasBaixaDevolucao: 60,
    },
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "000000015",
    gateway_boleto_nosso_numero: "000000015",
    gateway_status: "PENDING",
  };
  const fake = fakeRepository({ currentReceivable: isolatedDependency });
  const retroactiveBody = {
    ...body,
    dataPagamento: "2026-07-19",
  };
  let cancelCalled = false;

  await assert.rejects(
    () => settleReceivableManually({
      ...dependencies(fake.repository, retroactiveBody),
      cancelBanese: async () => {
        cancelCalled = true;
        throw new Error("não deveria cancelar");
      },
    }),
    /não pode receber baixa após 60 dias/i,
  );

  assert.equal(cancelCalled, false);
  assert.equal(fake.finalizeCalls, 0);
});

Deno.test("projeta inscrição e matrícula após concluir a baixa manual", async () => {
  const bankReceivable = {
    ...receivable,
    matricula_id: ENROLLMENT_ID,
    tipo_lancamento: "MATRICULA",
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "000000015",
    gateway_boleto_nosso_numero: "000000015",
    gateway_status: "PENDING",
  };
  const fake = fakeRepository({ currentReceivable: bankReceivable });
  const calls: string[] = [];

  const result = await settleReceivableManually({
    ...dependencies(fake.repository),
    cancelBanese: async () => ({
      receivable: { ...bankReceivable, gateway_status: "CANCELED" },
      remotePaymentId: "000000015",
      remoteStatus: "CANCELED",
      alreadyCanceled: false,
    }),
    syncOnlineInscriptionPayment: async (_context, input) => {
      calls.push("inscricao");
      assert.equal(input.localStatus, "PAGO");
      assert.equal(input.legacyPaymentMethod, "DINHEIRO");
      assert.equal(input.receivable.status, "PAGO");
    },
    activateEnrollmentAfterPayment: async (_context, settledReceivable) => {
      calls.push("matricula");
      assert.equal(settledReceivable.matricula_id, ENROLLMENT_ID);
      assert.equal(settledReceivable.status, "PAGO");
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(calls, ["inscricao", "matricula"]);
  assert.equal(fake.finalizeCalls, 1);
});

Deno.test("replay retoma falha entre inscrição e ativação sem repetir a baixa", async () => {
  const bankReceivable = {
    ...receivable,
    matricula_id: ENROLLMENT_ID,
    tipo_lancamento: "MATRICULA",
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "000000015",
    gateway_boleto_nosso_numero: "000000015",
  };
  const request = normalizeManualSettlementRequest(body, bankReceivable, NOW);
  const fingerprint = await manualSettlementFingerprint(request);
  const completed = {
    ...attemptFrom({ request_fingerprint: fingerprint }),
    state: "COMPLETED" as const,
    lease_token: null,
    lease_expires_at: null,
    result: { success: true, settlementId: ATTEMPT_ID },
  };
  const fake = fakeRepository({
    currentReceivable: bankReceivable,
    existingAttempt: completed,
  });
  let failActivation = true;
  const calls: string[] = [];
  const retryableDependencies = {
    ...dependencies(fake.repository),
    syncOnlineInscriptionPayment: async () => {
      calls.push("inscricao");
    },
    activateEnrollmentAfterPayment: async () => {
      calls.push("matricula");
      if (failActivation) throw new Error("projeção indisponível");
    },
  };

  await assert.rejects(
    () => settleReceivableManually(retryableDependencies),
    /baixa financeira foi concluída.*mesma chave.*projeção indisponível/i,
  );
  assert.equal(fake.finalizeCalls, 0);

  failActivation = false;
  const result = await settleReceivableManually(retryableDependencies);
  assert.equal(result.replayed, true);
  assert.equal(result.academicSyncCompleted, true);
  assert.equal(result.academicSyncWarning, null);
  assert.equal(fake.finalizeCalls, 0);
  assert.deepEqual(calls, [
    "inscricao",
    "matricula",
    "inscricao",
    "matricula",
  ]);
});

Deno.test("replay não repete projeção acadêmica já concluída", async () => {
  const request = normalizeManualSettlementRequest(body, receivable, NOW);
  const fingerprint = await manualSettlementFingerprint(request);
  const completed = {
    ...attemptFrom({ request_fingerprint: fingerprint }),
    state: "COMPLETED" as const,
    lease_token: null,
    lease_expires_at: null,
    result: {
      success: true,
      settlementId: ATTEMPT_ID,
      academicSyncCompleted: true,
    },
  };
  const fake = fakeRepository({ existingAttempt: completed });
  const calls: string[] = [];

  const result = await settleReceivableManually({
    ...dependencies(fake.repository),
    syncOnlineInscriptionPayment: async () => {
      calls.push("inscricao");
    },
    activateEnrollmentAfterPayment: async () => {
      calls.push("matricula");
    },
  });

  assert.equal(result.replayed, true);
  assert.equal(fake.finalizeCalls, 0);
  assert.deepEqual(calls, []);
});
