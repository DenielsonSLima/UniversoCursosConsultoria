import {
  assertBaneseAsbaceField,
  assertBaneseDueDateFactor,
} from "../../internal/bank-fields.ts";
import {
  assertBaneseFinancialTermsEqual,
  baneseFinancialTermsFromPayload,
} from "../../internal/financial-terms-response.ts";
import { normalizeBaneseFinancialTerms } from "../../internal/financial-terms.ts";
import { assertBaneseBankNumbers } from "../../internal/types.ts";
import {
  type BaneseBoletoPayload,
  canonicalBanesePayerDocument,
} from "./boleto-payload.ts";
import {
  type AdapterCreateChargeInput,
  type AdapterCreateChargeResult,
  BANESE_BOLETO_STATUS,
  BaneseAdapterError,
} from "./types.ts";
import {
  asRecord,
  assertBoletoResponseNumber,
  firstString,
  metadataFrom,
  onlyDigits,
  sanitizedBoletoSnapshot,
  studentBoletoUrl,
} from "./utils.ts";

export const boletoResultFromResponse = (
  input: AdapterCreateChargeInput,
  payload: BaneseBoletoPayload,
  convenio: string,
  agency: string,
  raw: unknown,
  recovered: boolean,
): AdapterCreateChargeResult => {
  const metadata = metadataFrom(input.receivable || {});
  const expected = {
    ourNumber: payload.NossoNumero,
    amount: payload.ValorNominal,
    dueDate: payload.DataVencimento,
    documentNumber: payload.NumeroDocumento,
    companyTitleId: payload.IdTituloEmpresa,
    // O contrato Banese exige NumeroCPFCNPJ numérico no JSON e, portanto,
    // remove zeros à esquerda. A identidade local continua sendo a string
    // canônica recebida antes da serialização bancária.
    payerDocument: canonicalBanesePayerDocument(input.payer),
    requireRemoteTitleIdentity: recovered,
    agency,
    account: metadata.baneseConta ?? metadata.baneseContaDisplay,
  };
  const { rawRecord, codigoBarras, linhaDigitavel } =
    validateBaneseBoletoResponse(raw, expected);
  const financialTerms = input.financialTerms
    ? assertBaneseFinancialTermsEqual(
      normalizeBaneseFinancialTerms({
        ...input.financialTerms,
        nominalAmount: payload.ValorNominal,
        dueDate: payload.DataVencimento,
      }),
      baneseFinancialTermsFromPayload(
        rawRecord,
        payload.ValorNominal,
        payload.DataVencimento,
      ),
    )
    : null;
  const receivableId = firstString(input.receivable?.id);
  const portalUrl = studentBoletoUrl(input, receivableId);
  const situationCode = Number(
    rawRecord.CodigoSituacaoBoleto ?? rawRecord.codigoSituacaoBoleto,
  );
  const canonicalOurNumber = String(payload.NossoNumero);
  return {
    // O Banese pode desserializar NossoNumero como número e remover os zeros
    // à esquerda. A identidade remota canônica deste fluxo é sempre o Nosso
    // Número validado de 9 dígitos enviado no pedido.
    id: canonicalOurNumber,
    // O Banese devolve os dados do titulo, nao um PDF hospedado. A URL
    // apresentada ao aluno e sempre a pagina autenticada da Universo, onde o
    // boleto/carne e montado localmente a partir da linha e do codigo de barras
    // validados. Campos URL inesperados da resposta bancaria nunca viram link.
    link: portalUrl || null,
    bankSlipUrl: portalUrl || null,
    bankSlipDigitableLine: linhaDigitavel,
    bankSlipBarcode: codigoBarras,
    bankSlipOurNumber: canonicalOurNumber,
    financialTerms,
    status: Number.isInteger(situationCode)
      ? BANESE_BOLETO_STATUS[situationCode] || "UNKNOWN"
      : firstString(rawRecord.status, rawRecord.Status, "REGISTERING"),
    raw: {
      response: sanitizedBoletoSnapshot(rawRecord),
      request: sanitizedBoletoSnapshot(payload),
      convenio,
      nossoNumero: payload.NossoNumero,
      numeroLinhaDigitavel: linhaDigitavel,
      numeroCodigoBarras: codigoBarras,
      recovered,
    },
  };
};

type BaneseBoletoResponseExpectation = {
  ourNumber: unknown;
  amount: unknown;
  dueDate: unknown;
  agency?: unknown;
  account?: unknown;
  requireRemoteFinancialIdentity?: boolean;
  requireRemoteTitleIdentity?: boolean;
  documentNumber?: unknown;
  companyTitleId?: unknown;
  payerDocument?: unknown;
};

export type BanesePayerDocumentComparison = {
  status: "MATCH" | "DIFFERENT" | "MISSING" | "AMBIGUOUS";
  remoteDocument: string;
};

export const compareBanesePayerDocument = (
  rawPayer: unknown,
  expectedValue: unknown,
): BanesePayerDocumentComparison => {
  const expectedDocument = onlyDigits(expectedValue);
  const payer = asRecord(rawPayer);
  const remoteDigits = onlyDigits(
    payer.NumeroCPFCNPJ ?? payer.numeroCPFCNPJ ?? payer.numeroCpfCnpj,
  );
  if (!remoteDigits) return { status: "MISSING", remoteDocument: "" };

  const expectedType = expectedDocument.length === 14 ? "J" : "F";
  const remoteTypeValue = firstString(
    payer.TipoPessoa,
    payer.tipoPessoa,
  ).toUpperCase();
  if (remoteTypeValue && !["F", "J"].includes(remoteTypeValue)) {
    return { status: "DIFFERENT", remoteDocument: "" };
  }

  if (
    !remoteTypeValue && expectedType === "J" && remoteDigits.length <= 11 &&
    remoteDigits.padStart(14, "0") === expectedDocument
  ) {
    // Sem TipoPessoa, 11 dígitos (ou menos) podem representar tanto um CPF
    // quanto um CNPJ que perdeu zeros na serialização numérica.
    return { status: "AMBIGUOUS", remoteDocument: "" };
  }

  const remoteType = remoteTypeValue ||
    (remoteDigits.length > 11 ? "J" : expectedType);
  const remoteLength = remoteType === "J" ? 14 : 11;
  if (remoteDigits.length > remoteLength) {
    return { status: "DIFFERENT", remoteDocument: remoteDigits };
  }
  const remoteDocument = remoteDigits.padStart(remoteLength, "0");
  return {
    status: remoteType === expectedType && remoteDocument === expectedDocument
      ? "MATCH"
      : "DIFFERENT",
    remoteDocument,
  };
};

const assertBaneseReturnedIdentity = (
  rawRecord: Record<string, unknown>,
  expected: BaneseBoletoResponseExpectation,
) => {
  const expectedDocumentNumber = firstString(expected.documentNumber);
  const remoteDocumentNumber = firstString(
    rawRecord.NumeroDocumento,
    rawRecord.numeroDocumento,
  );
  if (
    expectedDocumentNumber &&
    (
      (expected.requireRemoteTitleIdentity && !remoteDocumentNumber) ||
      (remoteDocumentNumber &&
        remoteDocumentNumber.toLowerCase() !==
          expectedDocumentNumber.toLowerCase())
    )
  ) {
    throw new Error(
      "NumeroDocumento retornado pelo Banese diverge do recebivel solicitado.",
    );
  }

  const expectedCompanyTitleId = firstString(expected.companyTitleId);
  const remoteCompanyTitleId = firstString(
    rawRecord.IdTituloEmpresa,
    rawRecord.idTituloEmpresa,
  );
  if (
    expectedCompanyTitleId &&
    (
      (expected.requireRemoteTitleIdentity && !remoteCompanyTitleId) ||
      (remoteCompanyTitleId &&
        remoteCompanyTitleId.toLowerCase() !==
          expectedCompanyTitleId.toLowerCase())
    )
  ) {
    throw new Error(
      "IdTituloEmpresa retornado pelo Banese diverge do recebivel solicitado.",
    );
  }

  const expectedPayerDocument = onlyDigits(expected.payerDocument);
  if (expectedPayerDocument) {
    if (![11, 14].includes(expectedPayerDocument.length)) {
      throw new Error("CPF/CNPJ esperado do pagador Banese e invalido.");
    }
    const comparison = compareBanesePayerDocument(
      rawRecord.Pagador ?? rawRecord.pagador,
      expectedPayerDocument,
    );
    if (
      (expected.requireRemoteTitleIdentity &&
        comparison.status === "MISSING") ||
      !["MATCH", "MISSING"].includes(comparison.status)
    ) {
      throw new Error(
        "CPF/CNPJ do pagador retornado pelo Banese diverge do recebivel solicitado.",
      );
    }
  }
};

export const validateBaneseBoletoResponse = (
  raw: unknown,
  expected: BaneseBoletoResponseExpectation,
) => {
  const rawRecord = asRecord(raw);
  const codigoBarras = assertBoletoResponseNumber(
    rawRecord.NumeroCodigoBarras ?? rawRecord.numeroCodigoBarras,
    44,
    "codigo de barras",
  );
  const linhaDigitavel = assertBoletoResponseNumber(
    rawRecord.NumeroLinhaDigitavel ?? rawRecord.numeroLinhaDigitavel,
    47,
    "linha digitavel",
  );
  try {
    assertBaneseBankNumbers(linhaDigitavel, codigoBarras);

    const expectedOurNumber = onlyDigits(expected.ourNumber);
    if (!/^\d{9}$/.test(expectedOurNumber)) {
      throw new Error("Nosso Numero esperado deve possuir 9 digitos.");
    }
    const remoteOurNumberValue = firstString(
      rawRecord.NossoNumero,
      rawRecord.nossoNumero,
    );
    if (remoteOurNumberValue) {
      const remoteOurNumberDigits = onlyDigits(remoteOurNumberValue);
      if (
        !/^\d{1,9}$/.test(remoteOurNumberDigits) ||
        remoteOurNumberDigits.padStart(9, "0") !== expectedOurNumber
      ) {
        throw new Error(
          "Nosso Numero retornado diverge do titulo solicitado.",
        );
      }
    }

    const encodedOurNumber = codigoBarras.slice(30, 39);
    if (encodedOurNumber !== expectedOurNumber) {
      throw new Error(
        "Nosso Numero da chave ASBACE diverge do titulo solicitado.",
      );
    }

    assertBaneseReturnedIdentity(rawRecord, expected);

    const expectedAmountCents = Math.round(Number(expected.amount) * 100);
    const remoteAmountValue = rawRecord.ValorNominal ??
      rawRecord.valorNominal;
    const remoteAmount = Number(remoteAmountValue);
    const remoteAmountCents = Math.round(remoteAmount * 100);
    const encodedAmountCents = Number(codigoBarras.slice(9, 19));
    if (
      !Number.isSafeInteger(expectedAmountCents) ||
      expectedAmountCents <= 0 ||
      encodedAmountCents !== expectedAmountCents ||
      (expected.requireRemoteFinancialIdentity &&
        (!Number.isSafeInteger(remoteAmountCents) ||
          remoteAmountCents !== expectedAmountCents)) ||
      (!expected.requireRemoteFinancialIdentity &&
        remoteAmountValue !== undefined && remoteAmountValue !== null &&
        (!Number.isSafeInteger(remoteAmountCents) ||
          remoteAmountCents !== expectedAmountCents))
    ) {
      throw new Error(
        "ValorNominal ou valor codificado retornado pelo Banese diverge do titulo solicitado.",
      );
    }

    const expectedDueDate = String(expected.dueDate || "").slice(0, 10);
    const remoteDueDateValue = rawRecord.DataVencimento ??
      rawRecord.dataVencimento;
    const remoteDueDate = String(remoteDueDateValue || "").slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expectedDueDate) ||
      (expected.requireRemoteFinancialIdentity &&
        remoteDueDate !== expectedDueDate) ||
      (!expected.requireRemoteFinancialIdentity && remoteDueDateValue &&
        remoteDueDate !== expectedDueDate)
    ) {
      throw new Error(
        "DataVencimento retornada pelo Banese diverge do titulo solicitado.",
      );
    }
    assertBaneseDueDateFactor(codigoBarras, expectedDueDate);

    const trustedAgency = onlyDigits(expected.agency);
    const trustedAccount = onlyDigits(expected.account);
    if (
      /^\d{3}$/.test(trustedAgency) && trustedAgency !== "000" &&
      /^\d{9}$/.test(trustedAccount)
    ) {
      assertBaneseAsbaceField(codigoBarras, {
        agency: trustedAgency,
        account: trustedAccount,
        ourNumber: expectedOurNumber,
      });
    }
  } catch (cause) {
    const error = new BaneseAdapterError(
      `Banese registrou o boleto, mas a linha digitavel/codigo de barras falhou na validacao: ${
        cause instanceof Error ? cause.message : "retorno inconsistente"
      }. Nao tente emitir outro titulo antes da conciliacao.`,
    );
    (error as BaneseAdapterError & { remotePaymentCreated?: boolean })
      .remotePaymentCreated = true;
    throw error;
  }
  return { rawRecord, codigoBarras, linhaDigitavel };
};
