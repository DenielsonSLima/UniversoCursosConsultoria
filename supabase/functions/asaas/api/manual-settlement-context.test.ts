import assert from "node:assert/strict";
import { syncManualSettlementFutureCharges } from "./manual-settlement-future-sync.ts";
import { manualSettlementAuditedReceivableSnapshot } from "./manual-settlement.repository.ts";
import { settleReceivableManually } from "./manual-settlement.service.ts";
import {
  MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY,
  MANUAL_SETTLEMENT_CONTEXT_STANDARD,
  type ManualSettlementResult,
  type ManualSettlementServiceDependencies,
  type NormalizedManualSettlementRequest,
} from "./manual-settlement.types.ts";

const serviceSource = await Deno.readTextFile(
  new URL("./manual-settlement.service.ts", import.meta.url),
);

const request = (
  settlementContext: NormalizedManualSettlementRequest["settlementContext"],
): NormalizedManualSettlementRequest => ({
  receivableId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  accountId: "33333333-3333-4333-8333-333333333333",
  paymentDate: "2026-08-26",
  paymentMethod: "DINHEIRO",
  settlementContext,
  breakdown: {
    currency: "BRL",
    principalCents: 10_000,
    interestCents: 0,
    penaltyCents: 0,
    additionCents: 0,
    discountCents: 0,
    receivedCents: 10_000,
  },
});

const result: ManualSettlementResult = {
  success: true,
  settlementId: "44444444-4444-4444-8444-444444444444",
};

const dependencies = (
  onFutureSync: () => void,
): ManualSettlementServiceDependencies => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: {
        gerar_cobranca_futura: true,
        sincronizar_asaas: true,
      },
      error: null,
    }),
  };
  return {
    admin: { from: () => builder },
    actor: {} as ManualSettlementServiceDependencies["actor"],
    body: {},
    requirePoloAccess: () => {},
    getAsaasRuntime: async () => ({
      environment: "sandbox",
      baseUrl: "https://sandbox.example",
      apiKey: "test",
    }),
    syncFutureInstallments: async () => {
      onFutureSync();
    },
  };
};

Deno.test("ação rápida nunca chama sincronização ou geração futura", async () => {
  let futureSyncCalls = 0;
  let databaseReads = 0;
  let auditUpdates = 0;
  const deps = dependencies(() => {
    futureSyncCalls += 1;
  });
  deps.repository = {
    updateCompletedResult: async () => {
      auditUpdates += 1;
    },
  } as unknown as NonNullable<
    ManualSettlementServiceDependencies["repository"]
  >;
  const originalFrom = deps.admin.from;
  deps.admin.from = (...args: unknown[]) => {
    databaseReads += 1;
    return originalFrom(...args);
  };

  const settled = await syncManualSettlementFutureCharges(
    deps,
    request(MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY),
    { matricula_id: "55555555-5555-4555-8555-555555555555" },
    result,
  );

  assert.equal(settled.futureSyncSuppressed, true);
  assert.equal(databaseReads, 0);
  assert.equal(futureSyncCalls, 0);
  assert.equal(auditUpdates, 1);
});

Deno.test("replay da ação rápida também nunca sincroniza parcelas futuras", async () => {
  let futureSyncCalls = 0;
  let databaseReads = 0;
  const deps = dependencies(() => {
    futureSyncCalls += 1;
  });
  const originalFrom = deps.admin.from;
  deps.admin.from = (...args: unknown[]) => {
    databaseReads += 1;
    return originalFrom(...args);
  };
  deps.repository = {
    updateCompletedResult: async () => {},
  } as unknown as NonNullable<
    ManualSettlementServiceDependencies["repository"]
  >;

  const replay = await syncManualSettlementFutureCharges(
    deps,
    request(MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY),
    { matricula_id: "55555555-5555-4555-8555-555555555555" },
    { ...result, replayed: true },
  );

  assert.equal(replay.replayed, true);
  assert.equal(replay.futureSyncSuppressed, true);
  assert.equal(databaseReads, 0);
  assert.equal(futureSyncCalls, 0);
});

Deno.test("falha na auditoria da supressão não converte baixa concluída em erro", async () => {
  const deps = dependencies(() => {
    throw new Error("não deveria sincronizar");
  });
  deps.repository = {
    updateCompletedResult: async () => {
      throw new Error("auditoria indisponível");
    },
  } as unknown as NonNullable<
    ManualSettlementServiceDependencies["repository"]
  >;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const settled = await syncManualSettlementFutureCharges(
      deps,
      request(MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY),
      { matricula_id: "55555555-5555-4555-8555-555555555555" },
      result,
    );
    assert.equal(settled.futureSyncSuppressed, true);
  } finally {
    console.error = originalConsoleError;
  }
});

Deno.test("contexto padrão preserva sincronização futura canônica", async () => {
  let futureSyncCalls = 0;
  await syncManualSettlementFutureCharges(
    dependencies(() => {
      futureSyncCalls += 1;
    }),
    request(MANUAL_SETTLEMENT_CONTEXT_STANDARD),
    { matricula_id: "55555555-5555-4555-8555-555555555555" },
    result,
  );

  assert.equal(futureSyncCalls, 1);
});

Deno.test("backend rejeita tipo não elegível antes da tentativa ou cancelamento remoto", async () => {
  for (const launchType of ["MATRICULA", "OUTRO", undefined]) {
    let attemptCalls = 0;
    let remoteCalls = 0;
    const unexpectedAttemptCall = () => {
      attemptCalls += 1;
      throw new Error("tentativa não deveria ser acessada");
    };
    const repository = {
      getReceivable: async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        polo_id: "66666666-6666-4666-8666-666666666666",
        status: "PENDENTE",
        valor: "100.00",
        tipo_lancamento: launchType,
        gateway_provider: "banese_card",
        gateway_environment: "sandbox",
        gateway_payment_method: "BOLETO",
        gateway_payment_id: "000000015",
        gateway_boleto_nosso_numero: "000000015",
        gateway_status: "PENDING",
      }),
      getAttemptByIdempotencyKey: async () => unexpectedAttemptCall(),
      getActiveAttempt: async () => unexpectedAttemptCall(),
      createAttempt: async () => unexpectedAttemptCall(),
      claimAttempt: async () => unexpectedAttemptCall(),
      markRemoteReady: async () => unexpectedAttemptCall(),
      markReviewRequired: async () => unexpectedAttemptCall(),
      markSafeFailure: async () => unexpectedAttemptCall(),
      appendEvent: async () => unexpectedAttemptCall(),
      finalize: async () => unexpectedAttemptCall(),
      updateCompletedResult: async () => unexpectedAttemptCall(),
      setFutureSyncError: async () => unexpectedAttemptCall(),
    } as unknown as NonNullable<
      ManualSettlementServiceDependencies["repository"]
    >;

    await assert.rejects(
      () =>
        settleReceivableManually({
          admin: {},
          actor: {} as ManualSettlementServiceDependencies["actor"],
          body: {
            receivableId: "11111111-1111-4111-8111-111111111111",
            idempotencyKey: "22222222-2222-4222-8222-222222222222",
            contaBancariaId: "33333333-3333-4333-8333-333333333333",
            dataPagamento: "2026-08-26",
            formaPagamento: "DINHEIRO",
            valorPago: "100,00",
            valorJuros: "0",
            valorMulta: "0",
            valorAcrescimo: "0",
            valorDesconto: "0",
            settlementContext:
              MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY,
          },
          requirePoloAccess: () => {},
          getAsaasRuntime: async () => {
            remoteCalls += 1;
            return {
              environment: "sandbox",
              baseUrl: "https://sandbox.example",
              apiKey: "test",
            };
          },
          cancelBanese: async () => {
            remoteCalls += 1;
            throw new Error("cancelamento remoto não deveria ser chamado");
          },
          repository,
          now: () => new Date("2026-08-26T15:00:00.000Z"),
        }),
      /apenas de título existente com tipo financeiro reconhecido/i,
    );
    assert.equal(
      attemptCalls,
      0,
      `tipo ${String(launchType)} acessou tentativa`,
    );
    assert.equal(
      remoteCalls,
      0,
      `tipo ${String(launchType)} chamou integração`,
    );
  }
});

Deno.test("contexto fica auditável no snapshot e no evento inicial", () => {
  const snapshot = manualSettlementAuditedReceivableSnapshot(
    { status: "PENDENTE", valor: 100 },
    MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY,
  );
  assert.equal(
    snapshot.manual_settlement_context,
    MANUAL_SETTLEMENT_CONTEXT_DASHBOARD_EXISTING_TITLE_ONLY,
  );
  const settleServiceSource = serviceSource.slice(
    serviceSource.indexOf("export const settleReceivableManually"),
  );
  assert.ok(
    settleServiceSource.indexOf("normalizeManualSettlementRequest(") <
      settleServiceSource.indexOf("resolveAttempt("),
    "a allowlist do contexto deve rodar antes de criar ou resolver tentativa",
  );
  assert.ok(
    settleServiceSource.indexOf("resolveAttempt(") <
      settleServiceSource.indexOf("cancelRemoteTitleBeforeManualSettlement("),
    "a tentativa validada deve anteceder qualquer cancelamento remoto",
  );
  assert.match(
    serviceSource,
    /"STARTED",[\s\S]*?settlementContext: request\.settlementContext/,
  );
  assert.match(
    serviceSource,
    /syncManualSettlementFutureCharges\([\s\S]*?dependencies,[\s\S]*?request,/,
  );
  assert.equal(
    serviceSource.match(
      /syncManualSettlementFutureCharges\(\s*dependencies,\s*request,/g,
    )?.length,
    3,
    "fluxo novo, replay concluído e replay de projeção devem carregar o contexto",
  );
});
