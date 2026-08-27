import { baneseFinancialTermsFromPayload } from "../../internal/financial-terms-response.ts";
import {
  requestBaneseBoletoAccessToken,
  reserveBaneseNossoNumero,
} from "./auth.ts";
import {
  buildBaneseBoletoPayload,
  validateBaneseBoletoPayloadInput,
} from "./boleto-payload.ts";
import { boletoResultFromResponse } from "./boleto-response.ts";
import { confirmBaneseBoletoFinancialTerms } from "./boleto-financial-terms.ts";
import {
  type AdapterCreateChargeInput,
  type AdapterCreateChargeResult,
  BANESE_BOLETO_ENDPOINTS,
  BANESE_BOLETO_STATUS,
  type BaneseAccessToken,
  BaneseAdapterConfigurationError,
  BaneseAdapterError,
  BaneseCancellationRequiresReviewError,
  type Environment,
  type SupabaseAdminRpcClient,
} from "./types.ts";
import {
  asRecord,
  assertEnvironment,
  firstString,
  markRemotePaymentMayExist,
  metadataFrom,
  onlyDigits,
  readResponseBody,
  sanitizedBoletoSnapshot,
} from "./utils.ts";
import {
  normalizeBanesePixFromResponse,
  normalizeBanesePixFromResponses,
} from "./boleto-pix-response.ts";

const isProduction = (environment: Environment) => environment === "production";

const withProductionPix = (
  result: AdapterCreateChargeResult,
  pix: Awaited<ReturnType<typeof normalizeBanesePixFromResponses>>,
): AdapterCreateChargeResult => ({
  ...result,
  pixPayload: pix.pixPayload,
  pixEncodedImage: pix.pixEncodedImage,
  raw: {
    ...asRecord(result.raw),
    // Diagnóstico deliberadamente sem payload, imagem ou credenciais.
    pixDiagnostic: pix.diagnostic,
  },
});

export const createBaneseBoletoCharge = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  assertEnvironment(input.environment);
  if (input.paymentMethod !== "BOLETO") {
    throw new BaneseAdapterError(
      "createBaneseBoletoCharge aceita apenas BOLETO.",
    );
  }

  const metadata = metadataFrom(input.receivable || {});
  let convenio = onlyDigits(
    metadata.baneseBoletoConvenio ?? metadata.baneseConvenio ??
      metadata.convenio ??
      metadata.idConvenio ?? metadata.id_convenio,
  );
  if (!convenio) {
    throw new BaneseAdapterConfigurationError(
      "Boleto Banese Card requer convenio em receivable.metadata.baneseBoletoConvenio ou baneseConvenio.",
    );
  }

  let agencia = onlyDigits(metadata.baneseAgencia).padStart(3, "0").slice(-3);
  if (!/^\d{3}$/.test(agencia) || agencia === "000") {
    throw new BaneseAdapterConfigurationError(
      "Boleto Banese requer a agencia beneficiaria com 3 digitos.",
    );
  }

  const receivableId = firstString(input.receivable?.id);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(receivableId)
  ) {
    throw new BaneseAdapterConfigurationError(
      "Boleto Banese requer um recebivel persistido antes do registro bancario.",
    );
  }

  // Tudo que depende somente do pedido local precisa falhar antes da reserva.
  // Depois dela, o Nosso Numero passa a representar uma intencao duravel de
  // registro remoto e erros locais nao podem ser promovidos a API_AMBIGUOUS.
  validateBaneseBoletoPayloadInput(input);

  const reservation = await reserveBaneseNossoNumero(input.admin, {
    receivableId,
    environment: input.environment,
    convenio,
    agencia,
  });
  const nossoNumero = reservation.nossoNumero;
  convenio = reservation.convenio;
  agencia = reservation.agencia;

  let token: BaneseAccessToken;
  let payload: ReturnType<typeof buildBaneseBoletoPayload>;
  try {
    token = await requestBaneseBoletoAccessToken(
      input.admin,
      input.environment,
    );
    payload = buildBaneseBoletoPayload({
      ...input,
      receivable: {
        ...(input.receivable || {}),
        baneseNossoNumero: nossoNumero,
        baneseAgencia: agencia,
      },
    });
  } catch (error) {
    throw reservation.alreadyReserved
      ? markRemotePaymentMayExist(error)
      : error;
  }
  const endpoint = `${
    BANESE_BOLETO_ENDPOINTS[input.environment].baseUrl
  }/convenios/${convenio}/boletos`;

  if (reservation.alreadyReserved) {
    let recoveryResponse: Response;
    try {
      recoveryResponse = await fetch(`${endpoint}/${nossoNumero}`, {
        headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
      });
    } catch (error) {
      throw markRemotePaymentMayExist(error);
    }
    const recoveryRaw = await readResponseBody(recoveryResponse);
    if (recoveryResponse.ok) {
      let confirmedRaw = recoveryRaw;
      if (input.financialTerms) {
        try {
          confirmedRaw = await confirmBaneseBoletoFinancialTerms({
            endpoint: `${endpoint}/${nossoNumero}`,
            token,
            payload,
            currentRaw: recoveryRaw,
            repairMismatch: input.environment === "sandbox",
          });
        } catch (error) {
          throw markRemotePaymentMayExist(error);
        }
      }
      if (isProduction(input.environment)) {
        const productionPix = await normalizeBanesePixFromResponses(
          [{ source: "confirmation", raw: confirmedRaw }],
          input.amount,
        );
        return withProductionPix(
          boletoResultFromResponse(
            input,
            payload,
            convenio,
            agencia,
            confirmedRaw,
            true,
          ),
          productionPix,
        );
      }
      return boletoResultFromResponse(
        input,
        payload,
        convenio,
        agencia,
        confirmedRaw,
        true,
      );
    }
    const notFound = recoveryResponse.status === 404 ||
      JSON.stringify(recoveryRaw).includes("ERRO_BOLETO_NAO_ENCONTRADO");
    if (!notFound) {
      throw markRemotePaymentMayExist(
        new BaneseAdapterError(
          `Nao foi possivel conciliar o Nosso Numero reservado antes de tentar novo registro Banese (${recoveryResponse.status}).`,
        ),
      );
    }
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `${token.tokenType} ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw markRemotePaymentMayExist(error);
  }
  const raw = await readResponseBody(response);

  if (!response.ok) {
    const error = new BaneseAdapterError(
      `Banese Card recusou criacao do boleto (${response.status}): ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
    const rawText = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (
      [408, 409, 425, 429].includes(response.status) ||
      response.status >= 500 ||
      /JA_EXISTE|J[AÁ] EXISTE|DUPLIC/i.test(rawText)
    ) {
      throw markRemotePaymentMayExist(error);
    }
    throw error;
  }

  let confirmedRaw = raw;
  if (input.financialTerms) {
    try {
      confirmedRaw = await confirmBaneseBoletoFinancialTerms({
        endpoint: `${endpoint}/${nossoNumero}`,
        token,
        payload,
        repairMismatch: false,
      });
    } catch (error) {
      throw markRemotePaymentMayExist(error);
    }
  }

  const result = boletoResultFromResponse(
    input,
    payload,
    convenio,
    agencia,
    confirmedRaw,
    false,
  );
  if (isProduction(input.environment)) {
    // O e-mail final do Banese confirma que o BolePix é devolvido no último
    // passo da criação. A consulta posterior usada para confirmar juros/multa
    // pode não repetir o QR; por isso a resposta original do POST prevalece.
    const pix = await normalizeBanesePixFromResponses([
      { source: "creation", raw },
      { source: "confirmation", raw: confirmedRaw },
    ], input.amount);
    return withProductionPix(result, pix);
  }

  return result;
};

export const queryBaneseBoleto = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  input: {
    convenio: unknown;
    nossoNumero: unknown;
    accessToken?: BaneseAccessToken;
    recoverPix?: boolean;
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
    await requestBaneseBoletoAccessToken(admin, environment);
  const baseEndpoint = `${
    BANESE_BOLETO_ENDPOINTS[environment].baseUrl
  }/convenios/${convenio}/boletos/${nossoNumero}`;
  const response = await fetch(baseEndpoint, {
    headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
    signal: input.signal,
  });
  const raw = await readResponseBody(response);
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
  const nominalAmount = Number(
    boleto.ValorNominal ?? boleto.valorNominal,
  );
  const dueDate = firstString(
    boleto.DataVencimento,
    boleto.dataVencimento,
  ).slice(0, 10);
  const financialTerms = baneseFinancialTermsFromPayload(
    boleto,
    nominalAmount,
    dueDate,
  );
  const situationCode = Number(
    boleto.CodigoSituacaoBoleto ?? boleto.codigoSituacaoBoleto,
  );
  const remoteStatus = BANESE_BOLETO_STATUS[situationCode] || "UNKNOWN";
  let payments: Array<Record<string, unknown>>;

  // O banco confirmou por e-mail que PagamentosEfetivados prevalece sobre
  // CodigoSituacaoBoleto. Por isso a consulta não pode depender do código 3.
  const paymentResponse = await fetch(
    `${baseEndpoint}/pagamentos/efetivados`,
    {
      headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
      signal: input.signal,
    },
  );
  const paymentRaw = await readResponseBody(paymentResponse);
  if (paymentResponse.ok) {
    const paymentRecord = asRecord(paymentRaw);
    const paymentItems = Array.isArray(paymentRaw)
      ? paymentRaw
      : paymentRecord.PagamentosEfetivados ??
        paymentRecord.pagamentosEfetivados ??
        [];
    payments = Array.isArray(paymentItems)
      ? paymentItems.map(asRecord).filter((item) =>
        Object.keys(item).length > 0
      )
      : [];
  } else {
    throw new BaneseAdapterError(
      `A consulta canônica de PagamentosEfetivados do Banese falhou (${paymentResponse.status}); o estado financeiro do boleto não pôde ser confirmado.`,
    );
  }
  const paid = payments.length > 0;
  const recoveredPix = isProduction(environment) && input.recoverPix
    ? await normalizeBanesePixFromResponse(boleto, nominalAmount)
    : null;

  return {
    convenio,
    nossoNumero: remoteNossoNumero || nossoNumero,
    situationCode,
    remoteStatus: paid ? BANESE_BOLETO_STATUS[3] || "PAID" : remoteStatus,
    paid,
    payments,
    financialTerms,
    pixPayload: recoveredPix?.pixPayload ?? null,
    pixEncodedImage: recoveredPix?.pixEncodedImage ?? null,
    raw: {
      ...sanitizedBoletoSnapshot(boleto),
      ...(recoveredPix ? { pixDiagnostic: recoveredPix.diagnostic } : {}),
    },
  };
};

export const cancelBaneseBoleto = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  input: {
    convenio: unknown;
    nossoNumero: unknown;
    onMutationStart?: () => void;
  },
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
  });
  if (current.paid) {
    throw new BaneseCancellationRequiresReviewError(
      "O Banese ja confirmou o pagamento deste boleto. Atualize a conciliacao antes da baixa manual.",
    );
  }
  if (current.situationCode === 5) {
    return {
      convenio,
      nossoNumero,
      situationCode: 5,
      remoteStatus: BANESE_BOLETO_STATUS[5],
      alreadyCanceled: true,
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
  const endpoint = `${
    BANESE_BOLETO_ENDPOINTS[environment].baseUrl
  }/convenios/${convenio}/boletos/${nossoNumero}/baixa`;
  input.onMutationStart?.();
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
  });
  await readResponseBody(response);

  const confirmed = await queryBaneseBoleto(admin, environment, {
    convenio,
    nossoNumero,
  });
  if (confirmed.paid) {
    throw new BaneseAdapterError(
      "O Banese confirmou pagamento durante a tentativa de baixa. O recebimento manual nao foi registrado.",
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
    raw: confirmed.raw,
  };
};
