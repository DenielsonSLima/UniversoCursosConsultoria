import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import {
  classifyBaneseSettlementMethod,
  sumBanesePaymentValues,
} from "./banese-reconciliation-contract.ts";
import { reconcileBaneseReceivable } from "./banese.ts";
import { persistBaneseBoletoIntent } from "../boleto/banese.ts";
import {
  boletoSnapshot,
  fakeAdmin,
  type FakeRow,
  RECEIVABLE_ID,
  receivableFixture,
} from "./banese-test-harness.ts";

Deno.test("persiste pedido financeiro Banese sob ownership antes do POST", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_payment_id: null,
    gateway_boleto_nosso_numero: null,
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-owned",
    gateway_financial_terms: null,
    gateway_financial_terms_confirmed_at: null,
    gateway_submission_channel: null,
    gateway_submission_status: null,
    metadata: { baneseBoletoConvenio: "15528" },
  });
  const admin = fakeAdmin(receivable);

  const result = await persistBaneseBoletoIntent({
    admin,
    supabaseUrl: "https://example.supabase.co",
    providerCode: "banese_card",
    environment: "sandbox",
    paymentMethod: "BOLETO",
    receivable,
    payer: { name: "Aluno Teste" },
    amount: BANESE_DOCUMENT_FIXTURE.amount,
    description: "Teste",
    dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
    financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  });

  assert.deepEqual(
    admin.tables.contas_receber[0].gateway_financial_terms,
    result.financialTerms,
  );
  assert.equal(result.financialTerms.nominalAmount, 20_000);
  assert.equal(result.financialTerms.discount?.validUntil, "2026-08-15");
  assert.equal(
    admin.tables.contas_receber[0].gateway_financial_terms_confirmed_at,
    null,
  );
  assert.equal(result.receivable.gateway_creation_token, "attempt-owned");
  assert.deepEqual(result.receivable.metadata, {
    baneseBoletoConvenio: "15528",
  });
});

Deno.test("pedido financeiro Banese perde CAS se ownership mudar", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_payment_id: null,
    gateway_boleto_nosso_numero: null,
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-original",
    gateway_financial_terms: null,
    gateway_financial_terms_confirmed_at: null,
    gateway_submission_channel: null,
    gateway_submission_status: null,
  });
  const admin = fakeAdmin(receivable);
  admin.beforeReceivableUpdate = (current) => {
    current.gateway_creation_token = "attempt-concurrent";
  };

  await assert.rejects(
    () =>
      persistBaneseBoletoIntent({
        admin,
        supabaseUrl: "https://example.supabase.co",
        providerCode: "banese_card",
        environment: "sandbox",
        paymentMethod: "BOLETO",
        receivable,
        payer: { name: "Aluno Teste" },
        amount: BANESE_DOCUMENT_FIXTURE.amount,
        description: "Teste",
        dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
        financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms,
      }),
    /mudou antes de persistir.*nenhum POST/i,
  );
  assert.equal(receivable.gateway_creation_token, "attempt-concurrent");
  assert.equal(receivable.gateway_financial_terms, null);
});

Deno.test("GET Banese positivo confirma submissao ambigua por CAS", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-ambiguous",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);

  const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
  });

  assert.equal(result.success, true);
  assert.equal(receivable.gateway_creation_token, null);
  assert.equal(receivable.gateway_submission_channel, "API");
  assert.equal(receivable.gateway_submission_status, "API_REGISTERED");
  assert.equal(receivable.gateway_status, "OPEN");
  assert.match(
    String(receivable.gateway_financial_terms_confirmed_at || ""),
    /^\d{4}-\d{2}-\d{2}T/,
  );
});

Deno.test("encaminha AbortSignal ao GET de conciliacao Banese", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-with-timeout",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);
  const controller = new globalThis.AbortController();
  let receivedSignal: AbortSignal | undefined;

  const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    signal: controller.signal,
    queryBoleto: (_admin, _environment, input) => {
      receivedSignal = input.signal;
      return Promise.resolve(boletoSnapshot() as any);
    },
  });

  assert.equal(result.success, true);
  assert.strictEqual(receivedSignal, controller.signal);
});

Deno.test("API_AMBIGUOUS recupera Pix com par bancario local ausente", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "11111111-2222-4333-8444-555555555555",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_boleto_linha_digitavel: null,
    gateway_boleto_codigo_barras: null,
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
  });
  const admin = fakeAdmin(receivable, []);

  const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () =>
      Promise.resolve(boletoSnapshot({
        pixPayload: "pix-oficial-validado-pelo-adapter",
        pixEncodedImage: "data:image/png;base64,aW1hZ2VtLW9maWNpYWw=",
        raw: {
          NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
          NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
        },
      }) as any),
  });

  assert.equal(result.success, true);
  assert.equal(receivable.gateway_submission_status, "API_REGISTERED");
  assert.equal(receivable.gateway_creation_token, null);
  assert.equal(
    receivable.gateway_boleto_codigo_barras,
    BANESE_DOCUMENT_FIXTURE.barcode,
  );
  assert.equal(admin.tables.payment_gateway_transactions.length, 1);
});

Deno.test("corrida impede confirmar API_AMBIGUOUS com snapshot antigo", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-original",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);
  admin.beforeReceivableUpdate = (current) => {
    current.gateway_creation_token = "attempt-concurrent";
    current.gateway_submission_status = "API_REVIEW";
  };

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
      }),
    /Cobranca mudou durante a conciliacao Banese/i,
  );
  assert.equal(receivable.gateway_creation_token, "attempt-concurrent");
  assert.equal(receivable.gateway_submission_status, "API_REVIEW");
  assert.equal(receivable.gateway_financial_terms_confirmed_at, null);
});

Deno.test("API_AMBIGUOUS sem pedido canonico falha antes do GET", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-legacy",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms: null,
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);
  let queried = false;

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => {
          queried = true;
          return Promise.resolve(boletoSnapshot() as any);
        },
      }),
    /pedido financeiro canonico.*antes do POST/i,
  );
  assert.equal(queried, false);
  assert.equal(receivable.gateway_submission_status, "API_AMBIGUOUS");
  assert.equal(receivable.gateway_creation_token, "attempt-legacy");
});

Deno.test("GET divergente preserva API_AMBIGUOUS e pedido canonico", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-divergent",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () =>
          Promise.resolve(boletoSnapshot({
            financialTerms: {
              ...BANESE_DOCUMENT_FIXTURE.financialTerms,
              discount: { type: "fixed", value: 10 },
            },
          }) as any),
      }),
    /termos retornados pelo Banese divergem|Desconto, multa ou juros.*divergem/i,
  );
  assert.equal(receivable.gateway_creation_token, "attempt-divergent");
  assert.equal(receivable.gateway_submission_status, "API_AMBIGUOUS");
  assert.equal(receivable.gateway_financial_terms_confirmed_at, null);
  assert.equal(admin.updateAttempts.length, 0);
});

Deno.test("pedido canonico divergente do recebivel falha antes do GET", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-invalid-intent",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms: {
      ...BANESE_DOCUMENT_FIXTURE.financialTerms,
      nominalAmount: 19_999.99,
    },
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);
  let queried = false;

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => {
          queried = true;
          return Promise.resolve(boletoSnapshot() as any);
        },
      }),
    /pedido financeiro canonico.*valor ou vencimento/i,
  );
  assert.equal(queried, false);
  assert.equal(receivable.gateway_submission_status, "API_AMBIGUOUS");
});

Deno.test("conciliacao Banese nao infere sandbox sem ambiente", async () => {
  const admin = fakeAdmin(receivableFixture({ gateway_environment: null }));
  await assert.rejects(
    () => reconcileBaneseReceivable(admin, RECEIVABLE_ID),
    /ambiente ausente ou invalido/i,
  );
  assert.equal(admin.updateAttempts.length, 0);
});

Deno.test("rejeita ValorPago nao finito antes de qualquer baixa", async () => {
  assert.throws(
    () => sumBanesePaymentValues([{ ValorPago: "NaN" }]),
    /ValorPago invalido.*baixa local foi preservada/i,
  );
  assert.throws(
    () => sumBanesePaymentValues([{ ValorPago: null }, { ValorPago: 20_000 }]),
    /ValorPago invalido/i,
  );
  assert.throws(
    () => sumBanesePaymentValues([{ ValorPago: " " }, { ValorPago: 20_000 }]),
    /ValorPago invalido/i,
  );
  for (const value of [0, -1]) {
    assert.throws(
      () => sumBanesePaymentValues([{ ValorPago: value }]),
      /ValorPago invalido/i,
    );
  }

  const admin = fakeAdmin(receivableFixture());
  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () =>
          Promise.resolve(boletoSnapshot({
            situationCode: 3,
            remoteStatus: "PAID",
            paid: true,
            payments: [{ ValorPago: "invalido", DataPagamento: "2026-07-16" }],
          }) as any),
      }),
    /ValorPago invalido/i,
  );
  assert.equal(admin.updateAttempts.length, 0);
  assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
});

Deno.test("classifica BolePix somente com prova canonica em todos os pagamentos", () => {
  assert.equal(
    classifyBaneseSettlementMethod([{ CodigoMotivoLiquidacao: "61" }]),
    "PIX",
  );
  assert.equal(
    classifyBaneseSettlementMethod([{ FormaLiquidacao: " BolePix " }]),
    "PIX",
  );
  assert.equal(
    classifyBaneseSettlementMethod([{
      CodigoMotivoLiquidacao: "61",
      FormaLiquidacao: "BOLETO",
    }]),
    "NAO_IDENTIFICADO",
  );
  assert.equal(
    classifyBaneseSettlementMethod([
      { CodigoMotivoLiquidacao: "61" },
      { FormaLiquidacao: "BOLETO" },
    ]),
    "MISTO",
  );
});

Deno.test("formato atualmente documentado pela API nao inventa o canal", () => {
  assert.equal(
    classifyBaneseSettlementMethod([{
      BancoRecebedor: "BANCO DO ESTADO DE SERGIPE",
      DataPagamento: "2026-08-15T10:00:00",
      ValorPago: 20_000,
      Descricao: "Liquidado via Pix",
      QrCode: "nao-e-prova-do-canal-usado",
    }]),
    "NAO_IDENTIFICADO",
  );
  assert.equal(
    classifyBaneseSettlementMethod([{ FormaLiquidacao: "BOLETO" }]),
    "BOLETO",
  );
  assert.equal(classifyBaneseSettlementMethod([]), "NAO_IDENTIFICADO");
});

Deno.test("rejeita qualquer DataPagamento invalida no detalhe bancario", async () => {
  const admin = fakeAdmin(receivableFixture());
  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () =>
          Promise.resolve(boletoSnapshot({
            situationCode: 3,
            remoteStatus: "PAID",
            paid: true,
            payments: [
              { ValorPago: 10_000, DataPagamento: "2026-02-30" },
              { ValorPago: 9_980.1, DataPagamento: "2026-08-15" },
            ],
          }) as any),
      }),
    /DataPagamento invalida/i,
  );
  assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
});
