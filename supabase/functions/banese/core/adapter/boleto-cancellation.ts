import { requestBaneseBoletoAccessToken } from "./auth.ts";
import { queryBaneseBoleto } from "./boleto-query.ts";
import {
  BANESE_BOLETO_ENDPOINTS,
  BANESE_BOLETO_STATUS,
  BaneseAdapterConfigurationError,
  BaneseAdapterError,
  BaneseCancellationRequiresReviewError,
  type Environment,
  type SupabaseAdminRpcClient,
} from "./types.ts";
import {
  asRecord,
  assertEnvironment,
  onlyDigits,
  readResponseBody,
} from "./utils.ts";

export type CancelBaneseBoletoInput = {
  convenio: unknown;
  nossoNumero: unknown;
  onMutationStart?: () => void | Promise<void>;
  stopWhenPixAvailable?: boolean;
  expectedAmount?: unknown;
  expectedDueDate?: unknown;
  expectedAgency?: unknown;
  expectedAccount?: unknown;
  expectedDocumentNumber?: unknown;
  expectedCompanyTitleId?: unknown;
  expectedPayerDocument?: unknown;
  expectedDigitableLine?: unknown;
  expectedBarcode?: unknown;
};

const identityOptions = (input: CancelBaneseBoletoInput) => ({
  recoverPix: input.stopWhenPixAvailable === true,
  validateTitleIdentity: input.expectedAmount !== undefined,
  expectedAmount: input.expectedAmount,
  expectedDueDate: input.expectedDueDate,
  expectedAgency: input.expectedAgency,
  expectedAccount: input.expectedAccount,
  expectedDocumentNumber: input.expectedDocumentNumber,
  expectedCompanyTitleId: input.expectedCompanyTitleId,
  expectedPayerDocument: input.expectedPayerDocument,
});

const assertLocalBankNumbers = (
  raw: unknown,
  input: CancelBaneseBoletoInput,
) => {
  const response = asRecord(raw);
  const remoteLine = onlyDigits(
    response.NumeroLinhaDigitavel ?? response.numeroLinhaDigitavel,
  );
  const remoteBarcode = onlyDigits(
    response.NumeroCodigoBarras ?? response.numeroCodigoBarras,
  );
  const expectedLine = onlyDigits(input.expectedDigitableLine);
  const expectedBarcode = onlyDigits(input.expectedBarcode);
  if (
    (expectedLine && remoteLine !== expectedLine) ||
    (expectedBarcode && remoteBarcode !== expectedBarcode)
  ) {
    throw new BaneseCancellationRequiresReviewError(
      "Linha digitavel ou codigo de barras diverge antes da baixa Banese.",
    );
  }
};

export const cancelBaneseBoleto = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  input: CancelBaneseBoletoInput,
) => {
  assertEnvironment(environment);
  const convenio = onlyDigits(input.convenio);
  const nossoNumero = onlyDigits(input.nossoNumero);
  if (!convenio || !/^\d{9}$/.test(nossoNumero)) {
    throw new BaneseAdapterConfigurationError(
      "Baixa Banese requer convenio e Nosso Numero validos.",
    );
  }

  const current = await queryBaneseBoleto(admin, environment, {
    convenio,
    nossoNumero,
    ...identityOptions(input),
  });
  assertLocalBankNumbers(current.raw, input);
  if (current.paymentsError) {
    throw new BaneseAdapterError(
      "Nao foi possivel confirmar PagamentosEfetivados antes da baixa Banese.",
    );
  }
  if (current.paid) {
    throw new BaneseCancellationRequiresReviewError(
      "O Banese ja confirmou o pagamento deste boleto. Atualize a conciliacao antes da baixa manual.",
    );
  }
  if (
    input.stopWhenPixAvailable === true && current.situationCode === 2 &&
    current.pixPayload && current.pixEncodedImage
  ) {
    return {
      convenio,
      nossoNumero,
      situationCode: current.situationCode,
      remoteStatus: current.remoteStatus,
      alreadyCanceled: false,
      mutationAttempted: false,
      pixAvailable: true,
      pixPayload: current.pixPayload,
      pixEncodedImage: current.pixEncodedImage,
      raw: current.raw,
    };
  }
  if (current.situationCode === 5) {
    return {
      convenio,
      nossoNumero,
      situationCode: 5,
      remoteStatus: BANESE_BOLETO_STATUS[5],
      alreadyCanceled: true,
      mutationAttempted: false,
      pixAvailable: false,
      pixPayload: null,
      pixEncodedImage: null,
      raw: current.raw,
    };
  }
  if (current.situationCode !== 2) {
    const ErrorType = current.situationCode === 0
      ? BaneseAdapterError
      : BaneseCancellationRequiresReviewError;
    throw new ErrorType(
      `Boleto Banese nao pode ser baixado na situacao ${current.situationCode} (${current.remoteStatus}).`,
    );
  }

  const token = await requestBaneseBoletoAccessToken(admin, environment);
  const endpoint = `${BANESE_BOLETO_ENDPOINTS[environment].baseUrl}` +
    `/convenios/${convenio}/boletos/${nossoNumero}/baixa`;
  await input.onMutationStart?.();
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
  });
  await readResponseBody(response);

  const confirmed = await queryBaneseBoleto(admin, environment, {
    convenio,
    nossoNumero,
    ...identityOptions({ ...input, stopWhenPixAvailable: false }),
  });
  assertLocalBankNumbers(confirmed.raw, input);
  if (confirmed.paymentsError) {
    throw new BaneseAdapterError(
      "Nao foi possivel confirmar PagamentosEfetivados depois da baixa Banese.",
    );
  }
  if (confirmed.paid) {
    throw new BaneseAdapterError(
      "O Banese confirmou pagamento durante a tentativa de baixa. A substituicao local foi bloqueada.",
    );
  }
  if (confirmed.situationCode !== 5) {
    const requestStatus = response.ok
      ? "aceita"
      : `recusada (${response.status})`;
    throw new BaneseAdapterError(
      `Baixa Banese ${requestStatus}, mas o titulo nao foi confirmado como cancelado. Tente novamente apos atualizar a cobranca.`,
    );
  }
  return {
    convenio,
    nossoNumero,
    situationCode: 5,
    remoteStatus: BANESE_BOLETO_STATUS[5],
    alreadyCanceled: false,
    mutationAttempted: true,
    pixAvailable: false,
    pixPayload: null,
    pixEncodedImage: null,
    raw: confirmed.raw,
  };
};
