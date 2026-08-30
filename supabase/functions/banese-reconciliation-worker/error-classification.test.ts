import assert from "node:assert/strict";
import {
  classifyBaneseReconciliationError,
  guardBaneseErrorStatusUpdate,
  shouldHaltBaneseReconciliationBatch,
  shouldWriteBaneseReceivableError,
} from "./error-classification.ts";

Deno.test("grava erro somente no estado financeiro compatível", () => {
  const calls: Array<[string, string, unknown]> = [];
  const query = {
    eq: (column: string, value: unknown) => {
      calls.push(["eq", column, value]);
      return query;
    },
    neq: (column: string, value: unknown) => {
      calls.push(["neq", column, value]);
      return query;
    },
  };

  guardBaneseErrorStatusUpdate(query, "POST_SETTLEMENT_PENDING");
  guardBaneseErrorStatusUpdate(query, "AUTH");

  assert.deepEqual(calls, [
    ["eq", "status", "PAGO"],
    ["neq", "status", "PAGO"],
  ]);
});

Deno.test("interrompe lote somente em falha sistêmica", () => {
  for (
    const message of [
      "Banese recusou consulta (429)",
      "Banese recusou consulta (401)",
      "Banese recusou consulta (503)",
      "Banese query timeout",
      "SUPABASE_AUDIT_WRITE",
      "fetch failed: getaddrinfo ENOTFOUND",
      Object.assign(new Error("Credencial Banese ausente"), {
        name: "BaneseAdapterConfigurationError",
      }),
    ]
  ) {
    const classification = classifyBaneseReconciliationError(
      message instanceof Error ? message : new Error(message),
    );
    assert.equal(
      shouldHaltBaneseReconciliationBatch(classification.errorClass),
      true,
    );
  }
});

Deno.test("bloqueio da RPC de persistência interrompe o lote sem nova baixa", () => {
  const classification = classifyBaneseReconciliationError(
    new Error("Acesso negado a persistencia da conciliacao Banese."),
  );

  assert.equal(classification.errorClass, "AUDIT_WRITE");
  assert.equal(
    classification.diagnosticCode,
    "RECONCILIATION_PERSISTENCE_DENIED",
  );
  assert.equal(
    shouldHaltBaneseReconciliationBatch(classification.errorClass),
    true,
  );
});

Deno.test("isola título ausente ou inválido e preserva o restante do lote", () => {
  for (
    const message of [
      "Banese recusou consulta do boleto (404)",
      "Linha digitavel invalida",
    ]
  ) {
    const classification = classifyBaneseReconciliationError(
      new Error(message),
    );
    assert.equal(
      shouldHaltBaneseReconciliationBatch(classification.errorClass),
      false,
    );
  }
});

Deno.test("expõe somente código seguro para divergência financeira ou bancária", () => {
  const financial = classifyBaneseReconciliationError(
    new Error(
      "Desconto, multa ou juros retornados pelo Banese divergem do titulo solicitado.",
    ),
  );
  const bankNumbers = classifyBaneseReconciliationError(
    new Error(
      "Linha digitavel retornada pelo Banese diverge do titulo persistido.",
    ),
  );
  const missingPixIdentity = classifyBaneseReconciliationError(
    new Error(
      "BolePix retornado sem numeros bancarios oficiais; a conciliacao foi bloqueada.",
    ),
  );

  assert.equal(financial.diagnosticCode, "REMOTE_FINANCIAL_TERMS_DIVERGENCE");
  assert.equal(bankNumbers.diagnosticCode, "BANK_NUMBERS_DIVERGENCE");
  const bankAmount = classifyBaneseReconciliationError(
    new Error(
      "Valor ou vencimento do codigo de barras Banese diverge do titulo.",
    ),
  );
  assert.equal(
    bankAmount.diagnosticCode,
    "RPC_BANK_AMOUNT_DUE_DIVERGENCE",
  );
  const bankDue = classifyBaneseReconciliationError(
    new Error("Fator de vencimento do codigo de barras diverge da data."),
  );
  assert.equal(
    bankDue.diagnosticCode,
    "REMOTE_BANK_DUE_FACTOR_DIVERGENCE",
  );
  assert.equal(
    missingPixIdentity.diagnosticCode,
    "PIX_IDENTITY_EVIDENCE_MISSING",
  );
});

Deno.test("classifica a etapa da revisão sem expor o retorno bancário", () => {
  const cases = [
    [
      "Formato de desconto retornado pelo Banese e invalido.",
      "REMOTE_DISCOUNT_SHAPE_INVALID",
    ],
    [
      "Conteudo de multa retornado pelo Banese e invalido.",
      "REMOTE_PENALTY_CONTENT_INVALID",
    ],
    [
      "Titulo Banese retornou mais de um desconto nao suportado.",
      "REMOTE_DISCOUNT_COUNT_UNSUPPORTED",
    ],
    [
      "Tipo de juros retornado pelo Banese e invalido.",
      "REMOTE_INTEREST_TYPE_INVALID",
    ],
    [
      "Titulo Banese ambiguo possui canal de submissao inconsistente; a conciliacao automatica foi bloqueada.",
      "LOCAL_SUBMISSION_CHANNEL_INCONSISTENT",
    ],
    [
      "Tipo de multa Banese invalido.",
      "LOCAL_FINANCIAL_TERMS_INVALID",
    ],
    [
      "Banese retornou ValorPago invalido; a baixa local foi preservada para conciliacao segura.",
      "REMOTE_PAYMENT_DETAIL_INVALID",
    ],
    [
      "Valor pago no Banese diverge dos termos confirmados do titulo; a baixa automatica foi bloqueada para revisao.",
      "REMOTE_PAYMENT_VALUE_DIVERGENCE",
    ],
    [
      "Identificadores locais do titulo Banese divergem entre si.",
      "LOCAL_TITLE_IDENTITY_DIVERGENCE",
    ],
    [
      "Transacao Banese possui identificador divergente; a conciliacao foi bloqueada.",
      "TRANSACTION_TITLE_IDENTITY_DIVERGENCE",
    ],
    [
      "Banese registrou o boleto, mas a linha digitavel/codigo de barras falhou na validacao: ValorNominal retornado pelo Banese diverge do titulo solicitado.",
      "REMOTE_NOMINAL_AMOUNT_DIVERGENCE",
    ],
    [
      "ValorNominal retornado pelo Banese diverge do titulo solicitado [REMOTE_MINOR_UNITS].",
      "REMOTE_NOMINAL_AMOUNT_MINOR_UNITS",
    ],
    [
      "ValorNominal retornado pelo Banese diverge do titulo solicitado [REMOTE_MATCHES_BARCODE_AMOUNT].",
      "REMOTE_NOMINAL_MATCHES_BARCODE_AMOUNT",
    ],
    [
      "ValorNominal retornado pelo Banese diverge do titulo solicitado [REMOTE_MATCHES_CANONICAL_DUE_AMOUNT].",
      "REMOTE_NOMINAL_MATCHES_CANONICAL_DUE_AMOUNT",
    ],
    [
      "ValorNominal retornado pelo Banese diverge do titulo solicitado [REMOTE_LOWER_THAN_EXPECTED].",
      "REMOTE_NOMINAL_AMOUNT_LOWER",
    ],
    [
      "Banese registrou o boleto, mas a linha digitavel/codigo de barras falhou na validacao: DataVencimento retornada pelo Banese diverge do titulo solicitado.",
      "REMOTE_DUE_DATE_DIVERGENCE",
    ],
    [
      "Banese registrou o boleto, mas a linha digitavel/codigo de barras falhou na validacao: Conta diverge da chave ASBACE do codigo de barras.",
      "REMOTE_ASBACE_BENEFICIARY_DIVERGENCE",
    ],
  ] as const;

  for (const [message, diagnosticCode] of cases) {
    const classification = classifyBaneseReconciliationError(
      new Error(message),
    );
    assert.equal(classification.diagnosticCode, diagnosticCode);
    assert.equal(
      classification.publicMessage,
      "Consulta Banese requer revisão financeira.",
    );
  }
});

Deno.test("mantem baixa confirmada na fila quando a pos-baixa ficar pendente", () => {
  const classification = classifyBaneseReconciliationError(
    new Error(
      "BANESE_POST_SETTLEMENT_PENDING: detalhe interno que nao pode vazar",
    ),
  );

  assert.equal(classification.errorClass, "POST_SETTLEMENT_PENDING");
  assert.equal(classification.result, "ERROR");
  assert.equal(
    shouldHaltBaneseReconciliationBatch(classification.errorClass),
    false,
  );
  assert.equal(
    classification.publicMessage,
    "BANESE_POST_SETTLEMENT_PENDING: baixa confirmada; conclusão interna aguardando nova tentativa.",
  );
  assert.doesNotMatch(classification.publicMessage, /detalhe interno/i);
});

Deno.test("timeout fica na auditoria sem virar revisão financeira do título", () => {
  const timeout = classifyBaneseReconciliationError(
    new globalThis.DOMException("Timeout", "TimeoutError"),
  );
  const review = classifyBaneseReconciliationError(
    new Error("Valor pago no Banese diverge dos termos confirmados do titulo."),
  );

  assert.equal(timeout.errorClass, "TIMEOUT");
  assert.equal(shouldWriteBaneseReceivableError(timeout.errorClass), false);
  assert.equal(shouldWriteBaneseReceivableError(review.errorClass), true);
});

Deno.test("timeout PostgREST em objeto simples continua sendo falha técnica", () => {
  const timeout = classifyBaneseReconciliationError({
    code: "PGRST003",
    message: "Timed out acquiring connection from connection pool.",
  });

  assert.equal(timeout.errorClass, "TIMEOUT");
  assert.equal(shouldHaltBaneseReconciliationBatch(timeout.errorClass), true);
  assert.equal(shouldWriteBaneseReceivableError(timeout.errorClass), false);
});
