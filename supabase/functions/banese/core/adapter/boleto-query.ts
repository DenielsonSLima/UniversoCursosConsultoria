import { baneseFinancialTermsFromPayload } from "../../internal/financial-terms-response.ts";
import { requestBaneseBoletoAccessToken } from "./auth.ts";
import { queryBaneseEffectivePayments } from "./boleto-payment-query.ts";
import { normalizeBanesePixFromResponse } from "./boleto-pix-response.ts";
import { validateBaneseBoletoResponse } from "./boleto-response.ts";
import {
  BANESE_BOLETO_ENDPOINTS,
  BANESE_BOLETO_STATUS,
  type BaneseAccessToken,
  BaneseAdapterConfigurationError,
  BaneseAdapterError,
  type Environment,
  type SupabaseAdminRpcClient,
} from "./types.ts";
import {
  asRecord,
  assertEnvironment,
  awaitBaneseRead,
  firstString,
  onlyDigits,
  readResponseBody,
  sanitizedBoletoSnapshot,
} from "./utils.ts";

const isProduction = (environment: Environment) => environment === "production";

export const queryBaneseBoleto = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  input: {
    convenio: unknown;
    nossoNumero: unknown;
    accessToken?: BaneseAccessToken;
    recoverPix?: boolean;
    skipEffectivePaymentsWhenOfficiallyUnpaid?: boolean;
    validateTitleIdentity?: boolean;
    expectedAmount?: unknown;
    expectedDueDate?: unknown;
    expectedAgency?: unknown;
    expectedAccount?: unknown;
    expectedDocumentNumber?: unknown;
    expectedCompanyTitleId?: unknown;
    expectedPayerDocument?: unknown;
    signal?: AbortSignal;
  },
) => {
  assertEnvironment(environment);
  const convenio = onlyDigits(input.convenio);
  const nossoNumero = onlyDigits(input.nossoNumero);
  if (!convenio || !/^\d{9}$/.test(nossoNumero)) {
    throw new BaneseAdapterConfigurationError(
      "Consulta Banese requer convenio e Nosso Numero validos.",
    );
  }

  const token = input.accessToken ??
    await requestBaneseBoletoAccessToken(admin, environment, {
      signal: input.signal,
    });
  const baseEndpoint = `${BANESE_BOLETO_ENDPOINTS[environment].baseUrl}` +
    `/convenios/${convenio}/boletos/${nossoNumero}`;
  const response = await awaitBaneseRead(
    fetch(baseEndpoint, {
      headers: {
        Authorization: `${token.tokenType} ${token.accessToken}`,
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      signal: input.signal,
    }),
    input.signal,
  );
  const raw = await awaitBaneseRead(readResponseBody(response), input.signal);
  if (!response.ok) {
    throw new BaneseAdapterError(
      `Banese recusou consulta do boleto (${response.status}): ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
  }

  const boleto = asRecord(raw);
  const remoteNossoNumeroValue = boleto.NossoNumero ?? boleto.nossoNumero;
  const remoteNossoNumeroDigits = onlyDigits(remoteNossoNumeroValue);
  const remoteNossoNumero = remoteNossoNumeroDigits &&
      remoteNossoNumeroDigits.length <= 9
    ? remoteNossoNumeroDigits.padStart(9, "0")
    : remoteNossoNumeroDigits;
  if (
    remoteNossoNumeroValue !== undefined &&
    remoteNossoNumeroValue !== null &&
    remoteNossoNumero !== nossoNumero
  ) {
    throw new BaneseAdapterError(
      "Nosso Numero retornado pelo Banese diverge do titulo consultado.",
    );
  }

  const nominalAmount = Number(boleto.ValorNominal ?? boleto.valorNominal);
  const dueDate = firstString(
    boleto.DataVencimento,
    boleto.dataVencimento,
  ).slice(0, 10);
  const expectedAmount = Number(input.expectedAmount ?? nominalAmount);
  const expectedDueDate = firstString(input.expectedDueDate, dueDate)
    .slice(0, 10);
  let recoveredPix: {
    pixPayload: string | null;
    pixEncodedImage: string | null;
    diagnostic: Record<string, unknown>;
  } | null = null;
  if (
    isProduction(environment) &&
    (input.validateTitleIdentity || input.recoverPix)
  ) {
    validateBaneseBoletoResponse(boleto, {
      ourNumber: nossoNumero,
      amount: expectedAmount,
      dueDate: expectedDueDate,
      agency: input.expectedAgency,
      account: input.expectedAccount,
      documentNumber: input.expectedDocumentNumber,
      companyTitleId: input.expectedCompanyTitleId,
      payerDocument: input.expectedPayerDocument,
      requireRemoteFinancialIdentity: true,
      requireRemoteTitleIdentity: true,
    });
  }
  if (isProduction(environment) && input.recoverPix) {
    recoveredPix = await normalizeBanesePixFromResponse(
      boleto,
      expectedAmount,
    );
  }

  let financialTerms:
    | ReturnType<typeof baneseFinancialTermsFromPayload>
    | null = null;
  let financialTermsError: Error | null = null;
  try {
    financialTerms = baneseFinancialTermsFromPayload(
      boleto,
      nominalAmount,
      dueDate,
    );
  } catch (error) {
    if (!recoveredPix?.pixPayload || !recoveredPix.pixEncodedImage) throw error;
    financialTermsError = error instanceof Error
      ? error
      : new BaneseAdapterError(String(error || "Retorno financeiro invalido."));
  }
  const situationCode = Number(
    boleto.CodigoSituacaoBoleto ?? boleto.codigoSituacaoBoleto,
  );
  const remoteStatus = BANESE_BOLETO_STATUS[situationCode] || "UNKNOWN";
  const officiallyUnpaid = [2, 4, 5, 6, 7, 8].includes(situationCode);
  const skipPayments =
    input.skipEffectivePaymentsWhenOfficiallyUnpaid === true &&
    officiallyUnpaid;
  const { payments, raw: paymentsRaw, error: paymentsError } = skipPayments
    ? {
      payments: [] as Array<Record<string, unknown>>,
      raw: null,
      error: null,
    }
    : await queryBaneseEffectivePayments({
      baseEndpoint,
      token,
      signal: input.signal,
      allowFailure: Boolean(
        recoveredPix?.pixPayload && recoveredPix.pixEncodedImage,
      ),
    });
  if (
    isProduction(environment) && input.recoverPix &&
    (!recoveredPix?.pixPayload || !recoveredPix.pixEncodedImage) &&
    paymentsRaw
  ) {
    const paymentEnvelopePix = await normalizeBanesePixFromResponse(
      paymentsRaw,
      expectedAmount,
    );
    if (
      paymentEnvelopePix.pixPayload && paymentEnvelopePix.pixEncodedImage
    ) {
      recoveredPix = paymentEnvelopePix;
    } else if (recoveredPix) {
      recoveredPix = {
        ...recoveredPix,
        diagnostic: {
          ...recoveredPix.diagnostic,
          paymentEnvelope: paymentEnvelopePix.diagnostic,
        },
      };
    }
  }
  const paid = payments.length > 0;

  return {
    convenio,
    nossoNumero: remoteNossoNumero || nossoNumero,
    situationCode,
    remoteStatus: paid ? BANESE_BOLETO_STATUS[3] || "PAID" : remoteStatus,
    paid,
    payments,
    financialTerms,
    financialTermsError,
    paymentsError,
    pixPayload: recoveredPix?.pixPayload ?? null,
    pixEncodedImage: recoveredPix?.pixEncodedImage ?? null,
    raw: {
      ...sanitizedBoletoSnapshot(boleto),
      ...(recoveredPix ? { pixDiagnostic: recoveredPix.diagnostic } : {}),
    },
  };
};
