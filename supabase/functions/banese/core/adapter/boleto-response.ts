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
import type { BaneseBoletoPayload } from "./boleto-payload.ts";
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
  return {
    id: firstString(
      rawRecord.id,
      rawRecord.Id,
      rawRecord.NossoNumero,
      rawRecord.nossoNumero,
      rawRecord.NumeroDocumento,
      rawRecord.numeroDocumento,
      payload.NossoNumero,
      payload.IdTituloEmpresa,
    ),
    link: firstString(
      rawRecord.link,
      rawRecord.url,
      rawRecord.Url,
      rawRecord.urlBoleto,
      rawRecord.UrlBoleto,
      portalUrl,
    ) || null,
    bankSlipUrl: firstString(
      rawRecord.urlBoleto,
      rawRecord.UrlBoleto,
      portalUrl,
    ) || null,
    bankSlipDigitableLine: linhaDigitavel,
    bankSlipBarcode: codigoBarras,
    bankSlipOurNumber: String(payload.NossoNumero),
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

    const expectedAmountCents = Math.round(Number(expected.amount) * 100);
    const encodedAmountCents = Number(codigoBarras.slice(9, 19));
    if (
      !Number.isSafeInteger(expectedAmountCents) ||
      expectedAmountCents <= 0 ||
      encodedAmountCents !== expectedAmountCents
    ) {
      throw new Error(
        "Valor codificado no retorno Banese diverge do titulo solicitado.",
      );
    }

    assertBaneseDueDateFactor(codigoBarras, String(expected.dueDate || ""));

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
