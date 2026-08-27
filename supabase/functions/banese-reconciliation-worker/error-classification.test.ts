import assert from "node:assert/strict";
import {
  classifyBaneseReconciliationError,
  shouldHaltBaneseReconciliationBatch,
} from "./error-classification.ts";

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
