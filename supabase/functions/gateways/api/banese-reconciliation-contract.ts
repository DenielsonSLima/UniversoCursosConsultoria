import {
  assertBaneseBankNumbers,
  barcodeFromBaneseDigitableLine,
} from "../../banese/internal/bank-fields.ts";

export const onlyBaneseDigits = (value: unknown) =>
  String(value || "").replace(/\D/g, "");

const comparableBaneseTitleNumber = (value: unknown) => {
  const digits = onlyBaneseDigits(value);
  return digits && digits.length <= 9 ? digits.padStart(9, "0") : digits;
};

export type BaneseRecoveredBankNumbers = {
  digitableLine: string;
  barcode: string;
  hasRemoteDigitableLine: boolean;
  hasRemoteBarcode: boolean;
  replacePersistedBankNumbers: boolean;
};

const hasBankNumberValue = (value: unknown) =>
  value !== undefined && value !== null && String(value).trim() !== "";

export const sumBanesePaymentValues = (
  payments: Array<Record<string, unknown>>,
) =>
  payments.reduce((total, payment) => {
    const rawValue = payment.ValorPago ?? payment.valorPago;
    if (
      (typeof rawValue !== "number" && typeof rawValue !== "string") ||
      String(rawValue).trim() === ""
    ) {
      throw new Error(
        "Banese retornou ValorPago invalido; a baixa local foi preservada para conciliacao segura.",
      );
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        "Banese retornou ValorPago invalido; a baixa local foi preservada para conciliacao segura.",
      );
    }
    return total + value;
  }, 0);

export type BaneseSettlementMethod =
  | "BOLETO"
  | "PIX"
  | "NAO_IDENTIFICADO"
  | "MISTO";

const normalizedSettlementLabel = (value: unknown) =>
  String(value ?? "").trim().toUpperCase().replace(/[\s_-]+/g, " ");

const hasReasonCode61 = (value: unknown) => {
  const values = Array.isArray(value) ? value : [value];
  return values.some((candidate) =>
    normalizedSettlementLabel(candidate) === "61"
  );
};

const classifyBanesePaymentEvidence = (
  payment: Record<string, unknown>,
) => {
  const reasonValues = [
    payment.CodigoMotivoLiquidacao,
    payment.codigoMotivoLiquidacao,
    payment.CodigoOcorrenciaLiquidacao,
    payment.codigoOcorrenciaLiquidacao,
    payment.CodigoMotivo,
    payment.codigoMotivo,
    payment.CodigoOcorrencia,
    payment.codigoOcorrencia,
  ];
  const settlementValues = [
    payment.FormaLiquidacao,
    payment.formaLiquidacao,
    payment.CanalLiquidacao,
    payment.canalLiquidacao,
    payment.MeioLiquidacao,
    payment.meioLiquidacao,
    payment.MotivoLiquidacao,
    payment.motivoLiquidacao,
  ].filter((value) => value !== undefined && value !== null);
  const normalizedValues = settlementValues.map(normalizedSettlementLabel);
  const explicitlyPix = normalizedValues.some((value) =>
    ["PIX", "BOLEPIX", "BOLETO PIX", "LIQUIDADO VIA PIX"].includes(value)
  );
  const explicitlyBoleto = normalizedValues.some((value) =>
    ["BOLETO", "CODIGO DE BARRAS", "LINHA DIGITAVEL"].includes(value)
  );

  const hasPixEvidence = explicitlyPix || reasonValues.some(hasReasonCode61);
  if (hasPixEvidence && explicitlyBoleto) return "CONFLITO";
  if (hasPixEvidence) return "PIX";
  if (explicitlyBoleto) return "BOLETO";
  return "NAO_IDENTIFICADO";
};

/**
 * O produto bancario permanece BOLETO. O canal de liquidacao somente e
 * classificado quando o retorno traz prova canonica.
 */
export const classifyBaneseSettlementMethod = (
  payments: Array<Record<string, unknown>>,
): BaneseSettlementMethod => {
  if (payments.length === 0) return "NAO_IDENTIFICADO";
  const evidence = payments.map(classifyBanesePaymentEvidence);
  if (
    evidence.includes("CONFLITO") ||
    evidence.includes("NAO_IDENTIFICADO")
  ) {
    return "NAO_IDENTIFICADO";
  }
  const channels = new Set(evidence);
  if (channels.size > 1) return "MISTO";
  return evidence[0] as "PIX" | "BOLETO";
};

export const banesePaymentDate = (payment: Record<string, unknown>) => {
  const raw = String(
    payment.DataPagamento ?? payment.dataPagamento ?? "",
  ).trim();
  const date = raw.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(
      "Banese retornou DataPagamento invalida; a baixa local foi preservada para conciliacao segura.",
    );
  }
  return date;
};

export const assertBaneseTitleNumber = (value: unknown) => {
  const nossoNumero = onlyBaneseDigits(value);
  if (!/^\d{9}$/.test(nossoNumero)) {
    throw new Error("Nosso Numero Banese invalido para trava da conciliacao.");
  }
  return nossoNumero;
};

export const assertBaneseReceivableTitleCompatible = (
  receivable: Record<string, unknown>,
) => {
  const bankSlipOurNumber = comparableBaneseTitleNumber(
    receivable.gateway_boleto_nosso_numero,
  );
  const remotePaymentId = comparableBaneseTitleNumber(
    receivable.gateway_payment_id,
  );
  const canonical = assertBaneseTitleNumber(
    bankSlipOurNumber || remotePaymentId,
  );
  if (
    (bankSlipOurNumber && bankSlipOurNumber !== canonical) ||
    (remotePaymentId && remotePaymentId !== canonical)
  ) {
    throw new Error(
      "Identificadores locais do titulo Banese divergem entre si.",
    );
  }
  return canonical;
};

export const baneseReceivableTitleFilter = (value: unknown) => {
  const nossoNumero = assertBaneseTitleNumber(value);
  return `gateway_boleto_nosso_numero.eq.${nossoNumero},and(gateway_boleto_nosso_numero.is.null,gateway_payment_id.eq.${nossoNumero})`;
};

export const baneseTransactionTitleFilter = (value: unknown) => {
  const nossoNumero = assertBaneseTitleNumber(value);
  return `bank_slip_our_number.eq.${nossoNumero},remote_payment_id.eq.${nossoNumero}`;
};

export const assertBaneseTransactionPixCompatible = (
  transactions: Array<Record<string, unknown>> | null | undefined,
  pixPayload: unknown,
  pixEncodedImage: unknown,
) => {
  const canonicalPayload = String(pixPayload || "").trim();
  const canonicalImage = String(pixEncodedImage || "").trim();
  if (Boolean(canonicalPayload) !== Boolean(canonicalImage)) {
    throw new Error(
      "Snapshot Pix canonico esta incompleto; a conciliacao foi bloqueada.",
    );
  }
  if (
    transactions?.some((transaction) => {
      const persisted = String(transaction.pix_payload || "").trim();
      const persistedImage = String(
        transaction.pix_encoded_image || "",
      ).trim();
      if (Boolean(persisted) !== Boolean(persistedImage)) return true;
      if (!persisted) return false;
      return !canonicalPayload || persisted !== canonicalPayload ||
        persistedImage !== canonicalImage;
    })
  ) {
    throw new Error(
      "Transacao Banese possui payload Pix divergente; a conciliacao foi bloqueada.",
    );
  }
};

export const assertBaneseTransactionTitleCompatible = (
  transactions: Array<Record<string, unknown>> | null | undefined,
  nossoNumero: unknown,
) => {
  const canonical = assertBaneseTitleNumber(nossoNumero);
  if (
    transactions?.some((transaction) => {
      const bankSlipOurNumber = comparableBaneseTitleNumber(
        transaction.bank_slip_our_number,
      );
      const remotePaymentId = comparableBaneseTitleNumber(
        transaction.remote_payment_id,
      );
      return (bankSlipOurNumber && bankSlipOurNumber !== canonical) ||
        (remotePaymentId && remotePaymentId !== canonical);
    })
  ) {
    throw new Error(
      "Transacao Banese possui identificador divergente; a conciliacao foi bloqueada.",
    );
  }
};

export const assertBaneseReconciliationProvenance = (
  receivable: Record<string, unknown>,
  transactions: Array<Record<string, unknown>>,
  nossoNumero: string,
) => {
  const submissionStatus = String(
    receivable.gateway_submission_status || "",
  ).trim().toUpperCase();
  const submissionChannel = String(
    receivable.gateway_submission_channel || "",
  ).trim().toUpperCase();
  const cnabFileId = String(receivable.gateway_cnab_file_id || "").trim();
  const creationToken = String(receivable.gateway_creation_token || "").trim();
  const gatewayStatus = String(receivable.gateway_status || "")
    .trim().toUpperCase();

  if (
    submissionChannel !== "API" || cnabFileId ||
    !["API_REGISTERED", "API_AMBIGUOUS"].includes(submissionStatus)
  ) {
    throw new Error(
      "Titulo Banese nao possui proveniencia exclusiva de POST API; a consulta automatica foi bloqueada.",
    );
  }

  if (submissionStatus === "API_AMBIGUOUS") {
    if (!creationToken || gatewayStatus !== "CREATING") {
      throw new Error(
        "Titulo Banese ambiguo nao possui tentativa de POST canonica ativa; a consulta automatica foi bloqueada.",
      );
    }
    if (transactions.length > 1) {
      throw new Error(
        "Titulo Banese ambiguo possui mais de uma transacao; a consulta automatica foi bloqueada.",
      );
    }
    assertBaneseTransactionTitleCompatible(transactions, nossoNumero);
    if (
      transactions[0] &&
      Math.round(Number(transactions[0].amount) * 100) !==
        Math.round(Number(receivable.valor) * 100)
    ) {
      throw new Error(
        "Transacao da tentativa ambigua Banese diverge do valor do recebivel.",
      );
    }
    return;
  }

  if (transactions.length !== 1) {
    throw new Error(
      "Titulo Banese registrado nao possui exatamente uma transacao canonica do POST; a consulta automatica foi bloqueada.",
    );
  }
  const transaction = transactions[0];
  assertBaneseTransactionTitleCompatible(transactions, nossoNumero);
  const transactionOurNumber = comparableBaneseTitleNumber(
    transaction.bank_slip_our_number,
  );
  const transactionPaymentId = comparableBaneseTitleNumber(
    transaction.remote_payment_id,
  );
  if (
    transactionOurNumber !== nossoNumero &&
    transactionPaymentId !== nossoNumero
  ) {
    throw new Error(
      "Transacao canonica do POST Banese nao comprova o Nosso Numero conciliado.",
    );
  }
  if (
    Math.round(Number(transaction.amount) * 100) !==
      Math.round(Number(receivable.valor) * 100)
  ) {
    throw new Error(
      "Transacao canonica do POST Banese diverge do valor do recebivel.",
    );
  }
};

function canReplaceInvalidPersistedLine(
  persistedDigitableLine: string,
  persistedBarcode: string,
  recovered: { digitableLine: string; barcode: string },
) {
  if (!persistedDigitableLine || persistedBarcode !== recovered.barcode) {
    return false;
  }
  try {
    if (
      barcodeFromBaneseDigitableLine(persistedDigitableLine) !==
        recovered.barcode
    ) {
      return false;
    }
    assertBaneseBankNumbers(persistedDigitableLine, persistedBarcode);
    return false;
  } catch {
    // O mesmo código de barras oficial prova o título; somente uma linha local
    // já inválida pode ser substituída. Divergência entre títulos segue fechada.
    return true;
  }
}

export const assertBaneseTransactionBankNumbersCompatible = (
  transactions: Array<Record<string, unknown>> | null | undefined,
  recovered: BaneseRecoveredBankNumbers | null,
) => {
  if (!recovered) return;
  if (
    transactions?.some((transaction) => {
      const digitableLine = onlyBaneseDigits(
        transaction.bank_slip_digitable_line,
      );
      const barcode = onlyBaneseDigits(transaction.bank_slip_barcode);
      if (barcode && barcode !== recovered.barcode) return true;
      if (!digitableLine || digitableLine === recovered.digitableLine) {
        return false;
      }
      return !canReplaceInvalidPersistedLine(
        digitableLine,
        barcode,
        recovered,
      );
    })
  ) {
    throw new Error(
      "Transacao Banese possui numeros bancarios divergentes; a conciliacao foi bloqueada.",
    );
  }
};

export const loadCompatibleBaneseTransactions = async (
  admin: any,
  input: {
    receivableId: string;
    environment: string;
    nossoNumero: string;
    pixPayload: unknown;
    pixEncodedImage: unknown;
    bankNumbers: BaneseRecoveredBankNumbers | null;
  },
) => {
  const { data, error } = await admin
    .from("payment_gateway_transactions")
    .select(
      "id, raw_payload, pix_payload, pix_encoded_image, bank_slip_digitable_line, bank_slip_barcode, bank_slip_our_number, remote_payment_id, updated_at",
    )
    .eq("receivable_id", input.receivableId)
    .eq("provider_code", "banese_card")
    .eq("environment", input.environment)
    .eq("payment_method", "BOLETO");
  if (error) throw error;
  assertBaneseTransactionTitleCompatible(data, input.nossoNumero);
  assertBaneseTransactionPixCompatible(
    data,
    input.pixPayload,
    input.pixEncodedImage,
  );
  assertBaneseTransactionBankNumbersCompatible(data, input.bankNumbers);
  return data;
};

export const validateBaneseRecoveredBankNumbers = (
  raw: unknown,
  persisted: {
    digitableLine?: unknown;
    barcode?: unknown;
    expectedOurNumber?: unknown;
    pixPayload?: unknown;
  } = {},
): BaneseRecoveredBankNumbers | null => {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const remoteDigitableLineValue = record.NumeroLinhaDigitavel ??
    record.numeroLinhaDigitavel;
  const remoteBarcodeValue = record.NumeroCodigoBarras ??
    record.numeroCodigoBarras;
  const hasRemoteDigitableLine = hasBankNumberValue(remoteDigitableLineValue);
  const hasRemoteBarcode = hasBankNumberValue(remoteBarcodeValue);

  if (!hasRemoteDigitableLine && !hasRemoteBarcode) {
    if (persisted.pixPayload) {
      throw new Error(
        "BolePix retornado sem numeros bancarios oficiais; a conciliacao foi bloqueada.",
      );
    }
    return null;
  }

  const remoteDigitableLine = onlyBaneseDigits(remoteDigitableLineValue);
  const remoteBarcode = onlyBaneseDigits(remoteBarcodeValue);
  if (hasRemoteDigitableLine && remoteDigitableLine.length !== 47) {
    throw new Error(
      "Linha digitavel recuperada do Banese deve possuir 47 digitos.",
    );
  }
  if (hasRemoteBarcode && remoteBarcode.length !== 44) {
    throw new Error(
      "Codigo de barras recuperado do Banese deve possuir 44 digitos.",
    );
  }

  const persistedDigitableLine = onlyBaneseDigits(persisted.digitableLine);
  const persistedBarcode = onlyBaneseDigits(persisted.barcode);
  const candidateDigitableLine = remoteDigitableLine ||
    persistedDigitableLine;
  const candidateBarcode = remoteBarcode || persistedBarcode;
  let validated: { digitableLine: string; barcode: string };
  try {
    validated = assertBaneseBankNumbers(
      candidateDigitableLine,
      candidateBarcode,
    );
  } catch (cause) {
    throw new Error(
      `Dados bancarios recuperados do Banese sao invalidos: ${
        cause instanceof Error ? cause.message : "retorno inconsistente"
      }`,
      { cause },
    );
  }

  const expectedOurNumber = onlyBaneseDigits(persisted.expectedOurNumber);
  if (expectedOurNumber) {
    if (!/^\d{9}$/.test(expectedOurNumber)) {
      throw new Error(
        "Nosso Numero esperado para validar o retorno Banese e invalido.",
      );
    }
    if (validated.barcode.slice(30, 39) !== expectedOurNumber) {
      throw new Error(
        "Nosso Numero do codigo de barras retornado pelo Banese diverge do titulo conciliado.",
      );
    }
  }

  if (
    hasRemoteBarcode && persistedBarcode &&
    persistedBarcode !== validated.barcode
  ) {
    throw new Error(
      "Numeros bancarios retornados pelo Banese divergem do titulo persistido.",
    );
  }
  const persistedLineDiffers = Boolean(
    hasRemoteDigitableLine && persistedDigitableLine &&
      persistedDigitableLine !== validated.digitableLine,
  );
  const replacePersistedBankNumbers = persistedLineDiffers &&
    canReplaceInvalidPersistedLine(
      persistedDigitableLine,
      persistedBarcode,
      validated,
    );
  if (persistedLineDiffers && !replacePersistedBankNumbers) {
    throw new Error(
      "Numeros bancarios retornados pelo Banese divergem do titulo persistido.",
    );
  }

  return {
    ...validated,
    hasRemoteDigitableLine,
    hasRemoteBarcode,
    replacePersistedBankNumbers,
  };
};
