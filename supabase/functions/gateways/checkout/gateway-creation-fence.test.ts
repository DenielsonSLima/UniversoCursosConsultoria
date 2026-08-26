import assert from "node:assert/strict";
import {
  applyCheckoutAttemptSnapshot,
  claimExistingGatewayCheckout,
  gatewayAttemptIsOwned,
  gatewayCreationLockFilter,
} from "./gateway-creation-fence.ts";

Deno.test("trava Asaas nao expira automaticamente", () => {
  const filter = gatewayCreationLockFilter(
    "asaas",
    "2026-07-21T10:00:00.000Z",
  );
  assert.equal(filter, "gateway_status.is.null,gateway_status.neq.CREATING");
  assert.equal(filter.includes("updated_at.lt"), false);
});

Deno.test("snapshot legado Asaas CREATING nao pode adquirir nova trava", async () => {
  const snapshot = {
    id: "receivable-legacy",
    status: "PENDENTE",
    updated_at: "2026-07-21T09:00:00.000Z",
    gateway_status: null,
    asaas_status: "CREATING",
  };
  const admin = concurrentAdmin(snapshot);
  const claimed = await claimExistingGatewayCheckout({
    admin,
    receivable: snapshot,
    receivablePayload: {},
    providerCode: "asaas",
    attemptToken: "attempt-new",
    staleCreatingBefore: "2026-07-21T10:00:00.000Z",
  });
  assert.equal(claimed, null);
  assert.equal(admin.row().gateway_creation_token, undefined);
});

Deno.test("Banese permite retomada apenas pela janela explicita", () => {
  assert.equal(
    gatewayCreationLockFilter("banese_card", "2026-07-21T10:00:00.000Z"),
    "gateway_status.is.null,gateway_status.neq.CREATING,updated_at.lt.2026-07-21T10:00:00.000Z",
  );
});

Deno.test("Banese API_AMBIGUOUS expirado nunca adquire nova trava", async () => {
  const snapshot = {
    id: "receivable-banese-ambiguous",
    status: "PENDENTE",
    updated_at: "2026-07-21T09:00:00.000Z",
    gateway_creation_token: "attempt-original",
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_status: "CREATING",
    gateway_payment_id: null,
    gateway_payment_link_id: null,
    gateway_boleto_nosso_numero: null,
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
  };
  const admin = concurrentAdmin(snapshot);

  const claimed = await claimExistingGatewayCheckout({
    admin,
    receivable: snapshot,
    receivablePayload: {},
    providerCode: "banese_card",
    attemptToken: "attempt-retry",
    claimedAt: "2026-07-21T10:05:00.000Z",
    staleCreatingBefore: "2026-07-21T10:00:00.000Z",
  });

  assert.equal(claimed, null);
  assert.equal(admin.row().gateway_creation_token, "attempt-original");
  assert.equal(admin.row().gateway_submission_status, "API_AMBIGUOUS");
  assert.equal(admin.row().updated_at, "2026-07-21T09:00:00.000Z");
});

Deno.test("Banese CREATING sem marcador remoto pode usar a janela explicita", async () => {
  const snapshot = {
    id: "receivable-banese-local-stale",
    status: "PENDENTE",
    updated_at: "2026-07-21T09:00:00.000Z",
    gateway_creation_token: "attempt-abandoned",
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_status: "CREATING",
    gateway_payment_id: null,
    gateway_payment_link_id: null,
    gateway_boleto_nosso_numero: null,
    gateway_submission_channel: null,
    gateway_submission_status: null,
  };
  const admin = concurrentAdmin(snapshot);

  const claimed = await claimExistingGatewayCheckout({
    admin,
    receivable: snapshot,
    receivablePayload: {},
    providerCode: "banese_card",
    attemptToken: "attempt-retry",
    claimedAt: "2026-07-21T10:05:00.000Z",
    staleCreatingBefore: "2026-07-21T10:00:00.000Z",
  });

  assert.equal(claimed?.gateway_creation_token, "attempt-retry");
  assert.equal(admin.row().gateway_submission_status, null);
});

Deno.test("API_AMBIGUOUS sem CREATING tambem permanece fail-closed", async () => {
  for (const providerCode of ["banese_card", "mercado_pago"] as const) {
    const snapshot = {
      id: `receivable-${providerCode}`,
      status: "VENCIDO",
      updated_at: "2026-07-21T09:00:00.000Z",
      gateway_creation_token: null,
      gateway_provider: providerCode,
      gateway_environment: "production",
      gateway_payment_method: providerCode === "banese_card"
        ? "BOLETO"
        : "CREDIT_CARD",
      gateway_status: null,
      gateway_payment_id: null,
      gateway_payment_link_id: null,
      gateway_boleto_nosso_numero: null,
      gateway_submission_channel: "API",
      gateway_submission_status: "API_AMBIGUOUS",
    };
    const admin = concurrentAdmin(snapshot);

    const claimed = await claimExistingGatewayCheckout({
      admin,
      receivable: snapshot,
      receivablePayload: {},
      providerCode,
      attemptToken: "attempt-retry",
      staleCreatingBefore: "2026-07-21T10:00:00.000Z",
    });

    assert.equal(claimed, null);
    assert.equal(admin.row().gateway_creation_token, null);
    assert.equal(admin.row().gateway_submission_status, "API_AMBIGUOUS");
  }
});

Deno.test("snapshot do checkout inclui estado, identidade e termos canonicos", () => {
  const filters: Array<["eq" | "is", string, unknown]> = [];
  const query = {
    eq(field: string, value: unknown) {
      filters.push(["eq", field, value]);
      return query;
    },
    is(field: string, value: unknown) {
      filters.push(["is", field, value]);
      return query;
    },
  };

  applyCheckoutAttemptSnapshot(query, {
    status: "PENDENTE",
    data_pagamento: null,
    cliente_id: "aluno-1",
    matricula_id: "matricula-1",
    turma_id: "turma-1",
    tipo_lancamento: "MATRICULA",
    valor: 99.9,
    data_vencimento: "2026-08-30",
    descricao: "Inscricao EAD",
    origem_pagamento: "GATEWAY_ONLINE",
    updated_at: "2026-07-21T10:00:00.000Z",
    gateway_creation_token: null,
    gateway_provider: "asaas",
    gateway_environment: "sandbox",
    gateway_payment_method: "PIX",
    gateway_status: null,
    gateway_payment_id: null,
    gateway_payment_link_id: null,
    gateway_boleto_nosso_numero: null,
    asaas_status: null,
    asaas_payment_id: null,
    asaas_payment_link_id: null,
  });

  assert.deepEqual(filters.slice(0, 12), [
    ["eq", "status", "PENDENTE"],
    ["is", "data_pagamento", null],
    ["eq", "cliente_id", "aluno-1"],
    ["eq", "matricula_id", "matricula-1"],
    ["eq", "turma_id", "turma-1"],
    ["eq", "tipo_lancamento", "MATRICULA"],
    ["eq", "valor", 99.9],
    ["eq", "data_vencimento", "2026-08-30"],
    ["eq", "descricao", "Inscricao EAD"],
    ["eq", "origem_pagamento", "GATEWAY_ONLINE"],
    ["eq", "updated_at", "2026-07-21T10:00:00.000Z"],
    ["is", "gateway_creation_token", null],
  ]);
  assert.equal(
    filters.some(([kind, field, value]) =>
      kind === "is" && field === "gateway_status" && value === null
    ),
    true,
  );
});

const concurrentAdmin = (initial: Record<string, unknown>) => {
  let row = { ...initial };
  return {
    row: () => ({ ...row }),
    mutate: (value: Record<string, unknown>) => {
      row = { ...row, ...value };
    },
    from() {
      let patch: Record<string, unknown> = {};
      const predicates: Array<(value: Record<string, unknown>) => boolean> = [];
      const builder: any = {
        update(value: Record<string, unknown>) {
          patch = value;
          return builder;
        },
        eq(field: string, value: unknown) {
          predicates.push((candidate) => candidate[field] === value);
          return builder;
        },
        is(field: string, value: unknown) {
          predicates.push((candidate) =>
            (candidate[field] === null || candidate[field] === undefined) &&
            value === null
          );
          return builder;
        },
        in(field: string, values: unknown[]) {
          predicates.push((candidate) => values.includes(candidate[field]));
          return builder;
        },
        or(filter: string) {
          predicates.push((candidate) => {
            const status = String(candidate.gateway_status || "");
            if (!status || status !== "CREATING") return true;
            const stale = filter.match(/updated_at\.lt\.(.+)$/)?.[1];
            return Boolean(
              stale && String(candidate.updated_at || "") < stale,
            );
          });
          return builder;
        },
        select() {
          return builder;
        },
        async maybeSingle() {
          if (!predicates.every((predicate) => predicate(row))) {
            return { data: null, error: null };
          }
          row = { ...row, ...patch };
          return { data: { ...row }, error: null };
        },
      };
      return builder;
    },
  };
};

Deno.test("duas requisicoes com o mesmo snapshot permitem apenas uma criacao", async () => {
  const snapshot = {
    id: "receivable-1",
    status: "PENDENTE",
    origem_pagamento: "GATEWAY_ONLINE",
    updated_at: "2026-07-21T10:00:00.000Z",
    gateway_creation_token: null,
    gateway_provider: "asaas",
    gateway_environment: "sandbox",
    gateway_payment_method: "PIX",
    gateway_status: null,
    gateway_payment_id: null,
    gateway_payment_link_id: null,
    gateway_boleto_nosso_numero: null,
    asaas_status: null,
    asaas_payment_id: null,
    asaas_payment_link_id: null,
  };
  const admin = concurrentAdmin(snapshot);
  let remoteCreations = 0;

  const run = async (attemptToken: string, claimedAt: string) => {
    const claimed = await claimExistingGatewayCheckout({
      admin,
      receivable: snapshot,
      receivablePayload: {},
      providerCode: "asaas",
      attemptToken,
      claimedAt,
    });
    if (claimed) remoteCreations += 1;
    return claimed;
  };

  const [first, second] = await Promise.all([
    run("attempt-a", "2026-07-21T10:00:01.000Z"),
    run("attempt-b", "2026-07-21T10:00:02.000Z"),
  ]);

  assert.equal(remoteCreations, 1);
  assert.equal(Boolean(first) !== Boolean(second), true);
  assert.equal(gatewayAttemptIsOwned(admin.row(), "attempt-a"), true);
  assert.equal(gatewayAttemptIsOwned(admin.row(), "attempt-b"), false);
});

Deno.test("CAS rejeita drift de identidade, pagamento e termos sem depender de updated_at", async () => {
  const snapshot = {
    id: "receivable-canonical",
    status: "PENDENTE",
    data_pagamento: null,
    cliente_id: "aluno-1",
    matricula_id: "matricula-1",
    turma_id: "turma-1",
    tipo_lancamento: "MATRICULA",
    valor: 99.9,
    data_vencimento: "2026-08-30",
    descricao: "Inscricao EAD",
    origem_pagamento: "GATEWAY_ONLINE",
    updated_at: "2026-07-21T10:00:00.000Z",
    gateway_creation_token: null,
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_status: null,
    gateway_payment_id: null,
    gateway_payment_link_id: null,
    gateway_boleto_linha_digitavel: null,
    gateway_boleto_codigo_barras: null,
    gateway_boleto_nosso_numero: null,
    gateway_submission_channel: null,
    gateway_submission_status: null,
    gateway_cnab_file_id: null,
    asaas_status: null,
    asaas_payment_id: null,
    asaas_payment_link_id: null,
  };
  const drifts: Array<Record<string, unknown>> = [
    { data_pagamento: "2026-08-26T10:05:00.000Z" },
    { cliente_id: "aluno-2" },
    { matricula_id: "matricula-2" },
    { turma_id: "turma-2" },
    { tipo_lancamento: "PARCELA" },
    { valor: 109.9 },
    { data_vencimento: "2026-09-15" },
    { descricao: "Titulo substituido" },
  ];

  for (const drift of drifts) {
    const admin = concurrentAdmin(snapshot);
    admin.mutate(drift);

    const claimed = await claimExistingGatewayCheckout({
      admin,
      receivable: snapshot,
      receivablePayload: {
        cliente_id: snapshot.cliente_id,
        matricula_id: snapshot.matricula_id,
        turma_id: snapshot.turma_id,
        tipo_lancamento: snapshot.tipo_lancamento,
        valor: snapshot.valor,
        data_vencimento: snapshot.data_vencimento,
        descricao: snapshot.descricao,
      },
      providerCode: "banese_card",
      attemptToken: "attempt-stale",
    });

    assert.equal(claimed, null);
    for (const [field, value] of Object.entries(drift)) {
      assert.equal(admin.row()[field], value);
    }
    assert.equal(admin.row().gateway_creation_token, null);
  }
});
