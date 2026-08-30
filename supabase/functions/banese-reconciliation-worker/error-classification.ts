import { BANESE_POST_SETTLEMENT_PENDING_PREFIX } from "../gateways/api/banese-post-settlement.ts";

const reviewDiagnosticCode = (message: string) => {
  if (/Cobranca invalida para conciliacao Banese/i.test(message)) {
    return "LOCAL_RECEIVABLE_ID_INVALID";
  }
  if (/Ambiente ausente ou invalido no titulo Banese/i.test(message)) {
    return "LOCAL_ENVIRONMENT_INVALID";
  }
  if (/Nosso Numero Banese invalido para trava/i.test(message)) {
    return "LOCAL_TITLE_NUMBER_INVALID";
  }
  if (/Identificadores locais do titulo Banese divergem/i.test(message)) {
    return "LOCAL_TITLE_IDENTITY_DIVERGENCE";
  }
  if (/Transacao Banese possui identificador divergente/i.test(message)) {
    return "TRANSACTION_TITLE_IDENTITY_DIVERGENCE";
  }
  if (/nao possui o pedido financeiro canonico persistido/i.test(message)) {
    return "LOCAL_FINANCIAL_TERMS_MISSING";
  }
  if (/canal de submissao inconsistente/i.test(message)) {
    return "LOCAL_SUBMISSION_CHANNEL_INCONSISTENT";
  }
  if (/Formato de termos financeiros retornado pelo Banese/i.test(message)) {
    return "REMOTE_FINANCIAL_TERMS_CONTAINER_INVALID";
  }
  if (/Formato de desconto retornado pelo Banese/i.test(message)) {
    return "REMOTE_DISCOUNT_SHAPE_INVALID";
  }
  if (/Conteudo de desconto retornado pelo Banese/i.test(message)) {
    return "REMOTE_DISCOUNT_CONTENT_INVALID";
  }
  if (/Formato de multa retornado pelo Banese/i.test(message)) {
    return "REMOTE_PENALTY_SHAPE_INVALID";
  }
  if (/Conteudo de multa retornado pelo Banese/i.test(message)) {
    return "REMOTE_PENALTY_CONTENT_INVALID";
  }
  if (/Formato de juros retornado pelo Banese/i.test(message)) {
    return "REMOTE_INTEREST_SHAPE_INVALID";
  }
  if (/Conteudo de juros retornado pelo Banese/i.test(message)) {
    return "REMOTE_INTEREST_CONTENT_INVALID";
  }
  if (/mais de um desconto nao suportado/i.test(message)) {
    return "REMOTE_DISCOUNT_COUNT_UNSUPPORTED";
  }
  if (/Tipo de desconto retornado pelo Banese/i.test(message)) {
    return "REMOTE_DISCOUNT_TYPE_INVALID";
  }
  if (/Tipo de multa retornado pelo Banese/i.test(message)) {
    return "REMOTE_PENALTY_TYPE_INVALID";
  }
  if (/Tipo de juros retornado pelo Banese/i.test(message)) {
    return "REMOTE_INTEREST_TYPE_INVALID";
  }
  if (/ValorPago invalido|DataPagamento invalida/i.test(message)) {
    return "REMOTE_PAYMENT_DETAIL_INVALID";
  }
  if (/boleto pago sem detalhe completo do pagamento/i.test(message)) {
    return "REMOTE_PAYMENT_DETAIL_INCOMPLETE";
  }
  if (/Valor pago no Banese diverge/i.test(message)) {
    return "REMOTE_PAYMENT_VALUE_DIVERGENCE";
  }
  if (/Tipo de (?:desconto|multa|juros) Banese invalido/i.test(message)) {
    return "LOCAL_FINANCIAL_TERMS_INVALID";
  }
  if (/BolePix retornado sem numeros bancarios oficiais/i.test(message)) {
    return "PIX_IDENTITY_EVIDENCE_MISSING";
  }
  if (/snapshot Pix incompleto/i.test(message)) {
    return "PIX_SNAPSHOT_INCOMPLETE";
  }
  if (/Transacao Banese.*Pix divergente/i.test(message)) {
    return "TRANSACTION_PIX_DIVERGENCE";
  }
  if (/Desconto, multa ou juros.*divergem/i.test(message)) {
    return "REMOTE_FINANCIAL_TERMS_DIVERGENCE";
  }
  if (/Pedido financeiro canonico.*diverge/i.test(message)) {
    return "LOCAL_FINANCIAL_TERMS_DIVERGENCE";
  }
  if (/Valor codificado no retorno Banese diverge/i.test(message)) {
    return "REMOTE_BANK_AMOUNT_DIVERGENCE";
  }
  if (/Fator de vencimento.*diverge/i.test(message)) {
    return "REMOTE_BANK_DUE_FACTOR_DIVERGENCE";
  }
  if (/Valor ou vencimento do codigo de barras Banese diverge/i.test(message)) {
    return "RPC_BANK_AMOUNT_DUE_DIVERGENCE";
  }
  if (/ValorNominal.*REMOTE_MINOR_UNITS_MATCH_BARCODE_AMOUNT/i.test(message)) {
    return "REMOTE_NOMINAL_MINOR_UNITS_MATCH_BARCODE_AMOUNT";
  }
  if (/ValorNominal.*REMOTE_MINOR_UNITS/i.test(message)) {
    return "REMOTE_NOMINAL_AMOUNT_MINOR_UNITS";
  }
  if (/ValorNominal.*REMOTE_MATCHES_CANONICAL_DUE_AMOUNT/i.test(message)) {
    return "REMOTE_NOMINAL_MATCHES_CANONICAL_DUE_AMOUNT";
  }
  if (/ValorNominal.*REMOTE_MATCHES_BARCODE_AMOUNT/i.test(message)) {
    return "REMOTE_NOMINAL_MATCHES_BARCODE_AMOUNT";
  }
  if (/ValorNominal.*REMOTE_ZERO/i.test(message)) {
    return "REMOTE_NOMINAL_AMOUNT_ZERO";
  }
  if (/ValorNominal.*REMOTE_LOWER_THAN_EXPECTED/i.test(message)) {
    return "REMOTE_NOMINAL_AMOUNT_LOWER";
  }
  if (/ValorNominal retornado pelo Banese diverge/i.test(message)) {
    return "REMOTE_NOMINAL_AMOUNT_DIVERGENCE";
  }
  if (/DataVencimento retornada pelo Banese diverge/i.test(message)) {
    return "REMOTE_DUE_DATE_DIVERGENCE";
  }
  if (/Snapshot da consulta Banese invalido/i.test(message)) {
    return "RPC_QUERY_SNAPSHOT_INVALID";
  }
  if (
    /ValorNominal ou DataVencimento da consulta Banese diverge/i.test(message)
  ) {
    return "RPC_QUERY_FINANCIAL_DIVERGENCE";
  }
  if (
    /Linha digitavel e codigo de barras Banese nao representam o mesmo titulo/i
      .test(message)
  ) {
    return "REMOTE_BANK_PAIR_INCONSISTENT";
  }
  if (
    /Digito (?:verificador de campo|geral modulo 11).*invalido/i.test(message)
  ) {
    return "REMOTE_BANK_CHECK_DIGIT_INVALID";
  }
  if (/(?:Agencia|Conta).*diverge da chave ASBACE/i.test(message)) {
    return "REMOTE_ASBACE_BENEFICIARY_DIVERGENCE";
  }
  if (/Duplo digito da chave ASBACE Banese e invalido/i.test(message)) {
    return "REMOTE_ASBACE_CHECK_DIGIT_INVALID";
  }
  if (/Numeros bancarios retornados pelo Banese divergem/i.test(message)) {
    return "LOCAL_BANK_NUMBERS_DIVERGENCE";
  }
  if (/Linha digitavel.*diverge|Codigo de barras.*diverge/i.test(message)) {
    return "BANK_NUMBERS_DIVERGENCE";
  }
  if (/Dados bancarios recuperados.*invalid|digito.*inval/i.test(message)) {
    return "BANK_NUMBERS_INVALID";
  }
  if (/Nosso Numero.*diverge/i.test(message)) {
    return "REMOTE_TITLE_DIVERGENCE";
  }
  if (/mudou durante/i.test(message)) return "LOCAL_CONCURRENCY_CONFLICT";
  return "REVIEW_REQUIRED";
};

export const classifyBaneseReconciliationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const name = error instanceof Error ? error.name : "";
  const diagnosticCode = reviewDiagnosticCode(message);
  const statusMatch = message.match(/\((\d{3})\)/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;
  if (message.startsWith(BANESE_POST_SETTLEMENT_PENDING_PREFIX)) {
    return {
      result: "ERROR" as const,
      errorClass: "POST_SETTLEMENT_PENDING",
      diagnosticCode: "POST_SETTLEMENT_PENDING",
      httpStatus: null,
      publicMessage:
        `${BANESE_POST_SETTLEMENT_PENDING_PREFIX} baixa confirmada; conclusão interna aguardando nova tentativa.`,
    };
  }
  if (httpStatus === 429) {
    return {
      result: "THROTTLED" as const,
      errorClass: "RATE_LIMIT",
      diagnosticCode: "RATE_LIMIT",
      httpStatus,
      publicMessage: "Consulta Banese temporariamente limitada (HTTP 429).",
    };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      result: "ERROR" as const,
      errorClass: "AUTH",
      diagnosticCode: "AUTH",
      httpStatus,
      publicMessage: "Falha de autenticação na consulta Banese.",
    };
  }
  if (httpStatus && httpStatus >= 500) {
    return {
      result: "ERROR" as const,
      errorClass: "UPSTREAM_5XX",
      diagnosticCode: "UPSTREAM_5XX",
      httpStatus,
      publicMessage: "Serviço Banese temporariamente indisponível.",
    };
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return {
      result: "ERROR" as const,
      errorClass: "TIMEOUT",
      diagnosticCode: "TIMEOUT",
      httpStatus,
      publicMessage: "Tempo esgotado na consulta Banese.",
    };
  }
  if (/SUPABASE_AUDIT_WRITE/i.test(message)) {
    return {
      result: "ERROR" as const,
      errorClass: "AUDIT_WRITE",
      diagnosticCode: "AUDIT_WRITE",
      httpStatus,
      publicMessage: "A consulta ocorreu, mas a auditoria interna falhou.",
    };
  }
  if (/Acesso negado a persistencia da conciliacao Banese/i.test(message)) {
    return {
      result: "ERROR" as const,
      errorClass: "AUDIT_WRITE",
      diagnosticCode: "RECONCILIATION_PERSISTENCE_DENIED",
      httpStatus,
      publicMessage: "A consulta ocorreu, mas a auditoria interna falhou.",
    };
  }
  if (
    /fetch failed|network|dns|getaddrinfo|econn(?:refused|reset)|connection (?:refused|reset)|socket|tls|certificate/i
      .test(message)
  ) {
    return {
      result: "ERROR" as const,
      errorClass: "NETWORK",
      diagnosticCode: "NETWORK",
      httpStatus,
      publicMessage: "Falha de rede na consulta Banese.",
    };
  }
  if (
    /Configuration/i.test(name) ||
    /credencial|configura(?:cao|ção)|convenio.*(?:ausente|invalido)|token.*(?:ausente|invalido)/i
      .test(message)
  ) {
    return {
      result: "ERROR" as const,
      errorClass: "CONFIGURATION",
      diagnosticCode: "CONFIGURATION",
      httpStatus,
      publicMessage: "Configuração Banese inválida para a consulta.",
    };
  }
  if (
    diagnosticCode !== "REVIEW_REQUIRED" ||
    /diverge|inválid|inval|bloquead|mudou durante/i.test(message)
  ) {
    return {
      result: "ERROR" as const,
      errorClass: "REVIEW_REQUIRED",
      diagnosticCode,
      httpStatus,
      publicMessage: "Consulta Banese requer revisão financeira.",
    };
  }
  return {
    result: "ERROR" as const,
    errorClass: "QUERY_ERROR",
    diagnosticCode: "QUERY_ERROR",
    httpStatus,
    publicMessage: "Não foi possível confirmar o título no Banese.",
  };
};

const SYSTEMIC_ERROR_CLASSES = new Set([
  "RATE_LIMIT",
  "AUTH",
  "UPSTREAM_5XX",
  "TIMEOUT",
  "AUDIT_WRITE",
  "NETWORK",
  "CONFIGURATION",
]);

export const shouldHaltBaneseReconciliationBatch = (errorClass: string) =>
  SYSTEMIC_ERROR_CLASSES.has(errorClass);

// Erros transitórios são telemetria da execução, não divergência financeira
// do título. Mantê-los em gateway_last_error faz a tela chamar uma simples
// nova tentativa de "revisão", mesmo sem qualquer evidência de pagamento.
export const shouldWriteBaneseReceivableError = (errorClass: string) =>
  errorClass === "POST_SETTLEMENT_PENDING" ||
  !SYSTEMIC_ERROR_CLASSES.has(errorClass);

export const guardBaneseErrorStatusUpdate = (
  query: {
    eq: (column: string, value: unknown) => any;
    neq: (
      column: string,
      value: unknown,
    ) => any;
  },
  errorClass: string,
) =>
  errorClass === "POST_SETTLEMENT_PENDING"
    ? query.eq("status", "PAGO")
    : query.neq("status", "PAGO");
