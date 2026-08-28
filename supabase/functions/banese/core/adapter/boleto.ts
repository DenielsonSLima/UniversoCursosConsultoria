import {
  advanceBaneseNossoNumeroAfterCollision,
  requestBaneseBoletoAccessToken,
  reserveBaneseNossoNumero,
} from "./auth.ts";
import {
  buildBaneseBoletoPayload,
  validateBaneseBoletoPayloadInput,
} from "./boleto-payload.ts";
import {
  boletoResultFromResponse,
  validateBaneseBoletoResponse,
} from "./boleto-response.ts";
import { queryBaneseBoleto } from "./boleto-query.ts";
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
  assertEnvironment,
  firstString,
  markRemotePaymentMayExist,
  metadataFrom,
  onlyDigits,
  readResponseBody,
} from "./utils.ts";
import {
  normalizeBanesePixFromResponses,
  withRequiredBaneseProductionPix,
} from "./boleto-pix-response.ts";
import { recoverBaneseIncidentReservation } from "./boleto-incident-recovery.ts";
import { classifyBaneseBoletoCollision } from "./boleto-collision.ts";

export { queryBaneseBoleto } from "./boleto-query.ts";

const isProduction = (environment: Environment) => environment === "production";

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
  const expectedCreationToken = firstString(
    input.receivable?.gateway_creation_token,
  );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(expectedCreationToken)
  ) {
    throw new BaneseAdapterConfigurationError(
      "Boleto Banese requer ownership persistido da tentativa antes de consultar ou registrar o titulo.",
    );
  }

  // Tudo que depende somente do pedido local precisa falhar antes da reserva.
  // Depois dela, o Nosso Numero passa a representar uma intencao duravel de
  // registro remoto e erros locais nao podem ser promovidos a API_AMBIGUOUS.
  validateBaneseBoletoPayloadInput(input);

  let reservation = await reserveBaneseNossoNumero(input.admin, {
    receivableId,
    environment: input.environment,
    convenio,
    agencia,
    expectedCreationToken,
  });
  convenio = reservation.convenio;
  agencia = reservation.agencia;

  const token: BaneseAccessToken = await requestBaneseBoletoAccessToken(
    input.admin,
    input.environment,
  );
  if (reservation.recoveryPending) {
    const recovery = await recoverBaneseIncidentReservation({
      charge: input,
      receivableId,
      convenio,
      agencia,
      token,
      candidateStart: reservation.recoveryCandidateStart,
      candidateEnd: reservation.recoveryCandidateEnd,
      expectedCreationToken,
    });
    reservation = recovery.reservation;
    if (recovery.recoveredResult) return recovery.recoveredResult;
  }
  const endpoint = `${
    BANESE_BOLETO_ENDPOINTS[input.environment].baseUrl
  }/convenios/${convenio}/boletos`;
  const allocationIsSafe = () =>
    !isProduction(input.environment) || reservation.bankRangeConfirmed ||
    reservation.collisionPreflightEnabled;
  const payloadFor = (nossoNumero: string) =>
    buildBaneseBoletoPayload({
      ...input,
      receivable: {
        ...(input.receivable || {}),
        baneseNossoNumero: nossoNumero,
        baneseAgencia: agencia,
      },
    });
  const expectationFor = (
    payload: ReturnType<typeof buildBaneseBoletoPayload>,
  ) => ({
    ourNumber: payload.NossoNumero,
    amount: payload.ValorNominal,
    dueDate: payload.DataVencimento,
    agency: agencia,
    account: metadata.baneseConta ?? metadata.baneseContaDisplay,
    documentNumber: payload.NumeroDocumento,
    companyTitleId: payload.IdTituloEmpresa,
    payerDocument: payload.Pagador.NumeroCPFCNPJ,
  });
  const recoveredResult = async (
    raw: unknown,
    payload: ReturnType<typeof buildBaneseBoletoPayload>,
  ) => {
    validateBaneseBoletoResponse(raw, {
      ...expectationFor(payload),
      requireRemoteFinancialIdentity: true,
      requireRemoteTitleIdentity: true,
    });
    let confirmedRaw = raw;
    if (input.financialTerms) {
      try {
        confirmedRaw = await confirmBaneseBoletoFinancialTerms({
          endpoint: `${endpoint}/${payload.NossoNumero}`,
          token,
          payload,
          currentRaw: raw,
          repairMismatch: input.environment === "sandbox",
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
      true,
    );
    if (!isProduction(input.environment)) return result;
    const pix = await normalizeBanesePixFromResponses(
      [{ source: "confirmation", raw: confirmedRaw }],
      input.amount,
    );
    return withRequiredBaneseProductionPix(result, pix);
  };
  const advanceCollision = async (
    raw: unknown,
    payload: ReturnType<typeof buildBaneseBoletoPayload>,
    stage: "PREFLIGHT_GET" | "POST_DUPLICATE_GET",
  ) => {
    const collision = await classifyBaneseBoletoCollision(
      raw,
      expectationFor(payload),
    );
    if (collision.classification === "MATCH") {
      return { result: await recoveredResult(raw, payload), advanced: false };
    }
    if (collision.classification !== "FOREIGN") {
      throw new BaneseAdapterError(
        "O Banese retornou um titulo cuja identidade nao pode ser determinada com seguranca. Nenhum novo POST foi enviado.",
      );
    }
    if (!allocationIsSafe()) {
      throw new BaneseAdapterConfigurationError(
        "A alocacao segura de Nosso Numero ainda nao foi ativada. Nenhum POST foi enviado.",
      );
    }
    reservation = await advanceBaneseNossoNumeroAfterCollision(input.admin, {
      receivableId,
      environment: input.environment,
      convenio,
      agencia,
      expectedNossoNumero: payload.NossoNumero,
      collisionStage: stage,
      responseFingerprint: collision.fingerprintSha256,
      expectedCreationToken,
    });
    return { result: null, advanced: true };
  };

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const nossoNumero = reservation.nossoNumero;
    const payload = payloadFor(nossoNumero);
    let preflightRaw: unknown;
    let preflightStatus: number;
    try {
      const preflight = await fetch(`${endpoint}/${nossoNumero}`, {
        headers: {
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
      });
      preflightStatus = preflight.status;
      preflightRaw = await readResponseBody(preflight);
    } catch (cause) {
      throw new BaneseAdapterError(
        `A consulta preventiva Banese falhou antes de qualquer POST: ${
          cause instanceof Error ? cause.message : "erro de rede"
        }`,
      );
    }
    if (preflightStatus >= 200 && preflightStatus < 300) {
      const collision = await advanceCollision(
        preflightRaw,
        payload,
        "PREFLIGHT_GET",
      );
      if (collision.result) return collision.result;
      continue;
    }
    const notFound = preflightStatus === 404 ||
      JSON.stringify(preflightRaw).includes("ERRO_BOLETO_NAO_ENCONTRADO");
    if (!notFound) {
      throw new BaneseAdapterError(
        `Nao foi possivel consultar o Nosso Numero antes do registro Banese (${preflightStatus}). Nenhum POST foi enviado.`,
      );
    }
    if (!allocationIsSafe()) {
      throw new BaneseAdapterConfigurationError(
        "A alocacao segura de Nosso Numero ainda nao foi ativada. Nenhum POST foi enviado.",
      );
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
      const rawText = typeof raw === "string" ? raw : JSON.stringify(raw);
      const error = new BaneseAdapterError(
        `Banese Card recusou criacao do boleto (${response.status}): ${rawText}`,
      );
      const duplicate = response.status === 409 ||
        /JA_EXISTE|J[AÁ] EXISTE|DUPLIC/i.test(rawText);
      if (duplicate) {
        try {
          const duplicateQuery = await fetch(`${endpoint}/${nossoNumero}`, {
            headers: {
              Authorization: `${token.tokenType} ${token.accessToken}`,
            },
          });
          const duplicateRaw = await readResponseBody(duplicateQuery);
          if (!duplicateQuery.ok) throw error;
          const collision = await advanceCollision(
            duplicateRaw,
            payload,
            "POST_DUPLICATE_GET",
          );
          if (collision.result) return collision.result;
          continue;
        } catch (cause) {
          throw markRemotePaymentMayExist(cause);
        }
      }
      if (
        [408, 425, 429].includes(response.status) || response.status >= 500
      ) {
        throw markRemotePaymentMayExist(error);
      }
      throw error;
    }

    const creationPix = isProduction(input.environment)
      ? await normalizeBanesePixFromResponses(
        [{ source: "creation", raw }],
        input.amount,
      )
      : null;
    let postLookupRaw: unknown | undefined;
    if (
      creationPix && (!creationPix.pixPayload || !creationPix.pixEncodedImage)
    ) {
      try {
        const lookup = await fetch(`${endpoint}/${nossoNumero}`, {
          headers: {
            Authorization: `${token.tokenType} ${token.accessToken}`,
          },
        });
        postLookupRaw = await readResponseBody(lookup);
        if (!lookup.ok) {
          throw new BaneseAdapterError(
            `O boleto foi criado, mas a consulta unica do QrCode falhou (${lookup.status}).`,
          );
        }
        validateBaneseBoletoResponse(postLookupRaw, {
          ...expectationFor(payload),
          requireRemoteFinancialIdentity: true,
          requireRemoteTitleIdentity: true,
        });
      } catch (error) {
        throw markRemotePaymentMayExist(error);
      }
    }

    let confirmedRaw = postLookupRaw ?? raw;
    if (input.financialTerms) {
      try {
        confirmedRaw = await confirmBaneseBoletoFinancialTerms({
          endpoint: `${endpoint}/${nossoNumero}`,
          token,
          payload,
          currentRaw: isProduction(input.environment) ? postLookupRaw : raw,
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
    if (!isProduction(input.environment)) return result;
    const pix = creationPix?.pixPayload && creationPix.pixEncodedImage
      ? creationPix
      : await normalizeBanesePixFromResponses([
        { source: "creation", raw },
        { source: "confirmation", raw: confirmedRaw },
      ], input.amount);
    return withRequiredBaneseProductionPix(result, pix);
  }
  throw new BaneseAdapterError(
    "O limite seguro de colisoes de Nosso Numero Banese foi atingido; nenhum titulo foi sobrescrito.",
  );
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
