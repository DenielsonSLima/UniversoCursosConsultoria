import assert from "node:assert/strict";
import type { ParsedEvent } from "../gateways/api/banese-cnab240.types.ts";
import {
  assertCnabFileScope,
  assertCnabReturnPayloadSafety,
  assertReturnAgreement,
  canProcessNextCnabRecord,
  isCnabProcessingLeaseExpired,
  previewReturnEvent,
  resolveCnabFailureTransition,
} from "./return-service.ts";

Deno.test("processamento grande encerra o lote antes do timeout", () => {
  const startedAt = Date.parse("2026-07-21T12:00:00.000Z");
  assert.equal(
    canProcessNextCnabRecord(0, startedAt, startedAt + 60_000),
    true,
  );
  assert.equal(
    canProcessNextCnabRecord(1, startedAt, startedAt + 34_999),
    true,
  );
  assert.equal(
    canProcessNextCnabRecord(1, startedAt, startedAt + 35_000),
    false,
  );
  assert.equal(canProcessNextCnabRecord(99, startedAt, startedAt + 1), true);
  assert.equal(canProcessNextCnabRecord(100, startedAt, startedAt + 1), false);
});

class ReceivableQuery implements PromiseLike<{ data: any[]; error: null }> {
  constructor(private readonly rows: any[]) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  or() {
    return this;
  }
  limit() {
    return this;
  }
  then<TResult1 = { data: any[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((
        value: { data: any[]; error: null },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

const receivable = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "PENDENTE",
  valor: 250,
  gateway_boleto_nosso_numero: "123456789",
  gateway_boleto_convenio: "15528",
  gateway_creation_token: null as string | null,
  gateway_status: "PENDING",
  gateway_submission_channel: "API" as string | null,
  gateway_submission_status: "API_REGISTERED" as string | null,
  updated_at: "2026-07-21T12:00:00Z",
  gateway_financial_terms: {
    nominalAmount: 250,
    dueDate: "2026-08-15",
    discount: { type: "fixed", value: 10, validUntil: "2026-08-15" },
    penalty: { type: "fixed", value: 5, startsOn: "2026-08-16" },
    interest: { type: "monthly-percentage", value: 1, startsOn: "2026-08-16" },
  },
  gateway_financial_terms_confirmed_at: "2026-07-21T12:00:00Z",
};

const admin = (rows = [receivable]) => ({
  from() {
    return new ReceivableQuery(rows);
  },
});

const event = (changes: Partial<ParsedEvent> = {}): ParsedEvent => ({
  lineNumber: 4,
  lote: "0001",
  nossoNumero: "123456789",
  movementCode: "06",
  nominalAmount: 250,
  paidAmount: 240,
  occurrenceDate: "2026-08-15",
  segmentTMovement: "06",
  liquidationReasonCodes: ["61"],
  settlementChannel: "PIX",
  paid: true,
  rawTLine: null,
  rawULine: "",
  ...changes,
});

const context = {
  environment: "sandbox" as const,
  convenio: "15528",
  edi7Code: "123456",
};

Deno.test("prévia reconhece BolePix 61 e valida desconto confirmado", async () => {
  const result = await previewReturnEvent(admin(), context, event());
  assert.equal(result.status, "MATCHED");
  assert.equal(result.liquidation_channel, "PIX");
  assert.equal(result.expected_min_amount, 240);
  assert.equal(result.expected_max_amount, 240);
  assert.equal(result.receivable_id, receivable.id);
});

Deno.test("prévia não baixa valor fora da faixa financeira", async () => {
  const result = await previewReturnEvent(
    admin(),
    context,
    event({ paidAmount: 239.99 }),
  );
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.match(result.message, /fora da faixa/i);
});

Deno.test("prévia bloqueia liquidação durante criação remota concorrente", async () => {
  const result = await previewReturnEvent(
    admin([{
      ...receivable,
      gateway_creation_token: "22222222-2222-4222-8222-222222222222",
    }]),
    context,
    event(),
  );
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.match(result.message, /criação remota em andamento/i);
});

Deno.test("prévia bloqueia título apenas reservado e ainda não registrado", async () => {
  const result = await previewReturnEvent(
    admin([{
      ...receivable,
      gateway_submission_channel: null,
      gateway_submission_status: null,
    }]),
    context,
    event(),
  );
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.match(result.message, /registro externo confirmado/i);
});

Deno.test("prévia bloqueia cobrança que já saiu do estado financeiro conciliável", async () => {
  const result = await previewReturnEvent(
    admin([{ ...receivable, status: "PAGO" }]),
    context,
    event(),
  );
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.match(result.message, /status financeiro atual/i);
});

Deno.test("movimento 09 é registrado sem ser tratado como pagamento", async () => {
  const result = await previewReturnEvent(
    admin(),
    context,
    event({
      movementCode: "09",
      paid: false,
      paidAmount: 0,
      settlementChannel: null,
      liquidationReasonCodes: ["09"],
    }),
  );
  assert.equal(result.status, "MATCHED");
  assert.match(result.message, /sem baixa financeira/i);
});

Deno.test("retorno deve declarar o mesmo convênio nos headers de arquivo e lote", () => {
  const put = (line: string, start: number, end: number, value: string) =>
    line.slice(0, start - 1) + value.padStart(end - start + 1, "0") +
    line.slice(end);
  let header = " ".repeat(240);
  header = put(header, 33, 52, "15528");
  let lot = " ".repeat(240);
  lot = put(lot, 8, 8, "1");
  lot = put(lot, 34, 53, "15528");
  assert.doesNotThrow(() =>
    assertReturnAgreement(`${header}\r\n${lot}\r\n`, "15528")
  );
  assert.throws(
    () => assertReturnAgreement(`${header}\r\n${lot}\r\n`, "99999"),
    /convênio.*diverge/i,
  );
  const divergentLot = put(lot, 34, 53, "99999");
  assert.throws(
    () =>
      assertReturnAgreement(
        `${header}\r\n${lot}\r\n${divergentLot}\r\n`,
        "15528",
      ),
    /convênio.*diverge/i,
  );
});

Deno.test("arquivo CNAB deve pertencer ao provedor, ambiente, convênio e direção ativos", () => {
  const file = {
    provider_code: "banese_card",
    environment: "sandbox",
    convenio: "15528",
    direction: "RETORNO",
  };
  assert.doesNotThrow(() => assertCnabFileScope(file, context, "RETORNO"));
  assert.throws(
    () =>
      assertCnabFileScope(
        { ...file, provider_code: "asaas" },
        context,
        "RETORNO",
      ),
    /escopo Banese/i,
  );
  assert.throws(
    () =>
      assertCnabFileScope({ ...file, convenio: "99999" }, context, "RETORNO"),
    /escopo Banese/i,
  );
  assert.throws(
    () =>
      assertCnabFileScope(
        { ...file, direction: "REMESSA" },
        context,
        "RETORNO",
      ),
    /escopo Banese/i,
  );
});

Deno.test("retorno bloqueia controles binários e explosão de linhas", () => {
  assert.doesNotThrow(() =>
    assertCnabReturnPayloadSafety(new TextEncoder().encode("A".repeat(240)))
  );
  assert.throws(
    () => assertCnabReturnPayloadSafety(Uint8Array.of(65, 0, 66)),
    /controle inválido/i,
  );
  assert.throws(
    () => assertCnabReturnPayloadSafety(new TextEncoder().encode("A\nB\nC"), 2),
    /limite de registros/i,
  );
});

Deno.test("lease de processamento só pode ser retomado depois de 10 minutos", () => {
  const now = Date.parse("2026-07-21T12:10:00.000Z");
  assert.equal(
    isCnabProcessingLeaseExpired("2026-07-21T12:00:01.000Z", now),
    false,
  );
  assert.equal(
    isCnabProcessingLeaseExpired("2026-07-21T12:00:00.000Z", now),
    true,
  );
  assert.equal(isCnabProcessingLeaseExpired("data-inválida", now), false);
});

Deno.test("falha posterior nunca rebaixa um registro CNAB terminal", () => {
  assert.deepEqual(resolveCnabFailureTransition("ACTIVATED"), {
    terminal: true,
    status: "ACTIVATED",
    action: null,
  });
  assert.deepEqual(resolveCnabFailureTransition("ACTIVATION_PENDING"), {
    terminal: false,
    status: "ACTIVATION_PENDING",
    action: "ATIVACAO_FALHOU",
  });
  assert.deepEqual(resolveCnabFailureTransition("MATCHED"), {
    terminal: false,
    status: "ERROR",
    action: "RETORNO_REVISAO",
  });
  assert.throws(
    () => resolveCnabFailureTransition("ESTADO_DESCONHECIDO"),
    /estado do registro CNAB mudou/i,
  );
});
