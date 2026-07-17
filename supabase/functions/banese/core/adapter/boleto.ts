import { baneseFinancialTermsFromPayload } from "../../internal/financial-terms-response.ts";
import {
  requestBaneseBoletoAccessToken,
  reserveBaneseNossoNumero,
} from "./auth.ts";
import { buildBaneseBoletoPayload } from "./boleto-payload.ts";
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

export const createBaneseBoletoCharge = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  assertEnvironment(input.environment);
  if (input.environment !== "sandbox") {
    throw new BaneseAdapterConfigurationError(
      "Cobrancas Banese estao bloqueadas em producao enquanto a homologacao nao for concluida.",
    );
  }
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

  return boletoResultFromResponse(
    input,
    payload,
    convenio,
    agencia,
    confirmedRaw,
    false,
  );
};

export const queryBaneseBoleto = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  input: {
    convenio: unknown;
    nossoNumero: unknown;
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

  const token = await requestBaneseBoletoAccessToken(admin, environment);
  const baseEndpoint = `${
    BANESE_BOLETO_ENDPOINTS[environment].baseUrl
  }/convenios/${convenio}/boletos/${nossoNumero}`;
  const response = await fetch(baseEndpoint, {
    headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
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
  let payments: Array<Record<string, unknown>> = [];

  if (situationCode === 3) {
    const paymentResponse = await fetch(
      `${baseEndpoint}/pagamentos/efetivados`,
      {
        headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
      },
    );
    const paymentRaw = await readResponseBody(paymentResponse);
    if (!paymentResponse.ok) {
      throw new BaneseAdapterError(
        `Boleto Banese esta pago, mas a consulta dos pagamentos efetivados falhou (${paymentResponse.status}).`,
      );
    }
    const paymentRecord = asRecord(paymentRaw);
    payments = Array.isArray(paymentRecord.PagamentosEfetivados)
      ? paymentRecord.PagamentosEfetivados.map(asRecord)
      : [];
  }

  return {
    convenio,
    nossoNumero,
    situationCode,
    remoteStatus,
    paid: situationCode === 3,
    payments,
    financialTerms,
    raw: sanitizedBoletoSnapshot(boleto),
  };
};

export const cancelBaneseBoleto = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  input: {
    convenio: unknown;
    nossoNumero: unknown;
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
  if (current.situationCode === 3) {
    throw new BaneseAdapterError(
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
    throw new BaneseAdapterError(
      `Boleto Banese nao pode ser baixado na situacao ${current.situationCode} (${current.remoteStatus}).`,
    );
  }

  const token = await requestBaneseBoletoAccessToken(admin, environment);
  const endpoint = `${BANESE_BOLETO_ENDPOINTS[environment].baseUrl}/convenios/${convenio}/boletos/${nossoNumero}/baixa`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
  });
  await readResponseBody(response);

  const confirmed = await queryBaneseBoleto(admin, environment, {
    convenio,
    nossoNumero,
  });
  if (confirmed.situationCode === 3) {
    throw new BaneseAdapterError(
      "O Banese confirmou pagamento durante a tentativa de baixa. O recebimento manual nao foi registrado.",
    );
  }
  if (confirmed.situationCode !== 5) {
    const requestStatus = response.ok ? "aceita" : `recusada (${response.status})`;
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
