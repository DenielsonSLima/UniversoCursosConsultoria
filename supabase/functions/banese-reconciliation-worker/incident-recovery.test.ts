import assert from "node:assert/strict";
import {
  BANESE_INCIDENT_RECEIVABLE_IDS,
  BANESE_INCIDENT_SCOPE,
  classifyBaneseIncidentRecoveryFailure,
  hasBaneseIncidentMaterialRemoteEvidence,
  isBaneseIncidentDocumentReady,
  isBaneseIncidentTarget,
  recoverBaneseIncidentBatch,
  shouldPauseNormalReconciliationForIncident,
  storedBaneseIncidentFinancialTerms,
} from "./incident-recovery.ts";
import { baneseDocumentFixtureAt } from "../banese/internal/testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../banese/internal/testing/pix-fixture.ts";

const target = (overrides: Record<string, unknown> = {}) => ({
  receivable_id: BANESE_INCIDENT_RECEIVABLE_IDS[0],
  environment: BANESE_INCIDENT_SCOPE.environment,
  convenio: BANESE_INCIDENT_SCOPE.convenio,
  agencia: BANESE_INCIDENT_SCOPE.agencia,
  candidate_start: BANESE_INCIDENT_SCOPE.candidateStart,
  candidate_end: BANESE_INCIDENT_SCOPE.candidateEnd,
  state: "PENDING",
  completed_at: null,
  ...overrides,
});

const readyReceivable = () => {
  const boleto = baneseDocumentFixtureAt(0);
  return {
    id: BANESE_INCIDENT_RECEIVABLE_IDS[0],
    status: "PENDENTE",
    valor: boleto.amount,
    data_vencimento: boleto.dueDate,
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_boleto_convenio: BANESE_INCIDENT_SCOPE.convenio,
    gateway_boleto_agencia: BANESE_INCIDENT_SCOPE.agencia,
    gateway_cnab_file_id: null,
    gateway_submission_channel: "API",
    gateway_submission_status: "API_REGISTERED",
    gateway_creation_token: null,
    gateway_status: "PENDING",
    gateway_last_error: null,
    gateway_payment_id: boleto.ourNumber,
    gateway_bank_slip_url: "https://universocc.com.br/boleto/teste",
    gateway_boleto_nosso_numero: boleto.ourNumber,
    gateway_boleto_linha_digitavel: boleto.digitableLine,
    gateway_boleto_codigo_barras: boleto.barcode,
    gateway_boleto_issued_at: "2026-08-28T12:00:00.000Z",
    gateway_financial_terms: boleto.financialTerms,
    gateway_financial_terms_confirmed_at: "2026-08-28T12:00:00.000Z",
    gateway_pix_payload: buildBanesePixPayloadFixture(
      boleto.ourNumber,
      boleto.amount,
    ),
    gateway_pix_encoded_image: buildBanesePixImageFixture(1),
  };
};

Deno.test("recuperacao aceita somente a allowlist fechada dos 13 alvos", () => {
  assert.equal(BANESE_INCIDENT_RECEIVABLE_IDS.length, 13);
  assert.equal(new Set(BANESE_INCIDENT_RECEIVABLE_IDS).size, 13);
  assert.equal(isBaneseIncidentTarget(target()), true);
  assert.equal(
    isBaneseIncidentTarget(target({
      receivable_id: "11111111-1111-4111-8111-111111111111",
    })),
    false,
  );
  assert.equal(isBaneseIncidentTarget(target({ candidate_end: 24 })), false);
  assert.equal(
    isBaneseIncidentTarget(target({ environment: "sandbox" })),
    false,
  );
});

Deno.test("documento recuperado exige identidades, banco e Pix consistentes", () => {
  const ready = readyReceivable();
  assert.equal(isBaneseIncidentDocumentReady(ready), true);
  assert.equal(
    isBaneseIncidentDocumentReady({
      ...ready,
      gateway_payment_id: "000000000",
    }),
    false,
  );
  assert.equal(
    isBaneseIncidentDocumentReady({ ...ready, gateway_pix_payload: null }),
    false,
  );
  assert.equal(
    isBaneseIncidentDocumentReady({ ...ready, gateway_cnab_file_id: "cnab" }),
    false,
  );
  assert.equal(
    isBaneseIncidentDocumentReady({
      ...ready,
      gateway_boleto_codigo_barras: `${
        ready.gateway_boleto_codigo_barras.slice(0, 43)
      }0`,
    }),
    false,
  );
});

Deno.test("Nosso Numero isolado permite busca; evidencia remota bloqueia POST", () => {
  const ready = readyReceivable();
  const clean = {
    id: ready.id,
    gateway_provider: ready.gateway_provider,
    gateway_environment: ready.gateway_environment,
    gateway_payment_method: ready.gateway_payment_method,
    gateway_boleto_convenio: ready.gateway_boleto_convenio,
    gateway_boleto_agencia: ready.gateway_boleto_agencia,
    gateway_cnab_file_id: null,
    gateway_boleto_nosso_numero: ready.gateway_boleto_nosso_numero,
  };
  assert.equal(hasBaneseIncidentMaterialRemoteEvidence(clean), false);
  assert.equal(
    hasBaneseIncidentMaterialRemoteEvidence({
      ...clean,
      gateway_submission_status: "API_AMBIGUOUS",
    }),
    true,
  );
  assert.equal(
    hasBaneseIncidentMaterialRemoteEvidence({
      ...clean,
      gateway_boleto_codigo_barras: ready.gateway_boleto_codigo_barras,
    }),
    true,
  );
  assert.equal(
    hasBaneseIncidentMaterialRemoteEvidence({
      ...clean,
      id: "11111111-1111-4111-8111-111111111111",
      gateway_submission_status: "API_AMBIGUOUS",
    }),
    false,
  );
});

Deno.test("recuperacao preserva o snapshot financeiro original do titulo", () => {
  const original = {
    nominalAmount: 279.9,
    dueDate: "2026-11-15",
    discount: { type: "fixed", value: 19.9 },
    penalty: { type: "fixed", value: 5.6 },
    interest: { type: "daily-fixed", value: 0.19 },
  };
  assert.equal(
    storedBaneseIncidentFinancialTerms({ gateway_financial_terms: original }),
    original,
  );
  assert.equal(
    storedBaneseIncidentFinancialTerms({ gateway_financial_terms: [] }),
    null,
  );
});

Deno.test("diagnostico do incidente não expõe o retorno bancário", () => {
  assert.equal(
    classifyBaneseIncidentRecoveryFailure(
      new Error("Banese Card recusou autenticacao (401): conteúdo remoto"),
    ),
    "AUTH_HTTP_401",
  );
  assert.equal(
    classifyBaneseIncidentRecoveryFailure(
      new Error("A consulta de recuperacao Banese falhou antes de qualquer POST"),
    ),
    "RECOVERY_LOOKUP_NETWORK",
  );
});

Deno.test("falha ou lock do incidente impede lote normal", () => {
  const base = {
    processed: 1,
    ready: 1,
    recovered: 1,
    reconciled: 0,
    busy: 0,
    failed: 0,
  };
  assert.equal(shouldPauseNormalReconciliationForIncident(base), false);
  assert.equal(
    shouldPauseNormalReconciliationForIncident({ ...base, busy: 1 }),
    true,
  );
  assert.equal(
    shouldPauseNormalReconciliationForIncident({ ...base, failed: 1 }),
    true,
  );
});

Deno.test("batch consulta somente a tabela e o escopo fechado do incidente", async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "in", "eq", "is", "order"]) {
    query[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    };
  }
  query.limit = (...args: unknown[]) => {
    calls.push(["limit", ...args]);
    return Promise.resolve({ data: [], error: null });
  };
  const admin = {
    from: (table: string) => {
      calls.push(["from", table]);
      return query;
    },
  };

  const report = await recoverBaneseIncidentBatch(admin, "https://local");
  assert.deepEqual(report, {
    processed: 0,
    ready: 0,
    recovered: 0,
    reconciled: 0,
    busy: 0,
    failed: 0,
  });
  assert.deepEqual(calls[0], ["from", "banese_boleto_recovery_targets"]);
  assert.ok(
    calls.some(([method, column, value]) =>
      method === "in" && column === "receivable_id" &&
      Array.isArray(value) && value.length === 13
    ),
  );
  assert.ok(
    calls.some(([method, column, value]) =>
      method === "eq" && column === "environment" && value === "production"
    ),
  );
  assert.ok(
    calls.some(([method, column, value]) =>
      method === "eq" && column === "candidate_end" && value === 23
    ),
  );
});
