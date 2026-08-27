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
