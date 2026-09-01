import {
  claimBaneseIncidentRecoveredTitle,
  finishBaneseIncidentRecoveryScan,
} from "./auth.ts";
import {
  buildBaneseBoletoPayload,
  canonicalBanesePayerDocument,
} from "./boleto-payload.ts";
import {
  boletoResultFromResponse,
  validateBaneseBoletoResponse,
} from "./boleto-response.ts";
import { confirmBaneseBoletoFinancialTerms } from "./boleto-financial-terms.ts";
import { classifyBaneseBoletoCollision } from "./boleto-collision.ts";
import { assertBanesePixRecoveryEligible } from "./boleto-pix-recovery-eligibility.ts";
import {
  normalizeBanesePixFromResponses,
  withRequiredBaneseProductionPix,
} from "./boleto-pix-response.ts";
import {
  type AdapterCreateChargeInput,
  type AdapterCreateChargeResult,
  BANESE_BOLETO_ENDPOINTS,
  type BaneseAccessToken,
  BaneseAdapterError,
} from "./types.ts";
import {
  asRecord,
  calculateBaneseNossoNumero,
  metadataFrom,
  readResponseBody,
} from "./utils.ts";

type RecoveryReservation = {
  nossoNumero: string;
  convenio: string;
  agencia: string;
  alreadyReserved: boolean;
  bankRangeConfirmed: boolean;
  collisionPreflightEnabled: boolean;
  recoveryPending: false;
};

const recoveredIncidentResult = async (
  charge: AdapterCreateChargeInput,
  convenio: string,
  agencia: string,
  endpoint: string,
  token: BaneseAccessToken,
  raw: unknown,
  payload: ReturnType<typeof buildBaneseBoletoPayload>,
): Promise<AdapterCreateChargeResult | null> => {
  const metadata = metadataFrom(charge.receivable || {});
  const expectedResponse = {
    ourNumber: payload.NossoNumero,
    amount: payload.ValorNominal,
    dueDate: payload.DataVencimento,
    agency: agencia,
    account: metadata.baneseConta ?? metadata.baneseContaDisplay,
    documentNumber: payload.NumeroDocumento,
    companyTitleId: payload.IdTituloEmpresa,
    payerDocument: canonicalBanesePayerDocument(charge.payer),
    requireRemoteFinancialIdentity: true,
    requireRemoteTitleIdentity: true,
  };
  const collision = await classifyBaneseBoletoCollision(raw, expectedResponse);
  if (collision.classification === "FOREIGN") return null;
  if (collision.classification !== "MATCH") {
    throw new BaneseAdapterError(
      "A resposta da consulta de recuperacao Banese tem identidade indeterminada; a varredura nao foi avancada.",
    );
  }
  if (charge.allowPendingBolePix === true) {
    await assertBanesePixRecoveryEligible({
      raw,
      baseEndpoint: endpoint,
      token,
    });
  }
  const pix = await normalizeBanesePixFromResponses(
    [{ source: "confirmation", raw }],
    charge.amount,
  );
  const confirmedRaw = await confirmBaneseBoletoFinancialTerms({
    endpoint,
    token,
    payload,
    currentRaw: raw,
    repairMismatch: false,
    allowDiscountRemoval: charge.environment === "production",
  });
  validateBaneseBoletoResponse(confirmedRaw, expectedResponse);
  const result = boletoResultFromResponse(
    charge,
    payload,
    convenio,
    agencia,
    confirmedRaw,
    true,
  );
  return withRequiredBaneseProductionPix({
    ...result,
    raw: {
      ...asRecord(result.raw),
      recovered: true,
      recoveryEvidence: pix.pixPayload && pix.pixEncodedImage
        ? "BANK_NUMBERS_AND_OFFICIAL_PIX"
        : "FULL_TITLE_IDENTITY_WITH_PIX_PENDING",
    },
  }, pix, { allowPendingBolePix: charge.allowPendingBolePix === true });
};

export const recoverBaneseIncidentReservation = async (input: {
  charge: AdapterCreateChargeInput;
  receivableId: string;
  convenio: string;
  agencia: string;
  token: BaneseAccessToken;
  candidateStart: number;
  candidateEnd: number;
  expectedCreationToken: string;
}): Promise<{
  reservation: RecoveryReservation;
  recoveredResult: AdapterCreateChargeResult | null;
}> => {
  const endpoint = `${
    BANESE_BOLETO_ENDPOINTS[input.charge.environment].baseUrl
  }/convenios/${input.convenio}/boletos`;

  for (
    let candidate = input.candidateStart;
    candidate <= input.candidateEnd;
    candidate += 1
  ) {
    const nossoNumero = calculateBaneseNossoNumero(
      input.agencia,
      String(candidate).padStart(8, "0"),
    );
    const payload = buildBaneseBoletoPayload({
      ...input.charge,
      receivable: {
        ...(input.charge.receivable || {}),
        baneseNossoNumero: nossoNumero,
        baneseAgencia: input.agencia,
      },
    });
    let response: Response;
    try {
      response = await fetch(`${endpoint}/${nossoNumero}`, {
        headers: {
          Authorization: `${input.token.tokenType} ${input.token.accessToken}`,
        },
      });
    } catch (cause) {
      throw new BaneseAdapterError(
        `A consulta de recuperacao Banese falhou antes de qualquer POST: ${
          cause instanceof Error ? cause.message : "erro de rede"
        }`,
      );
    }
    const raw = await readResponseBody(response);
    const notFound = response.status === 404 ||
      JSON.stringify(raw).includes("ERRO_BOLETO_NAO_ENCONTRADO");
    if (notFound) continue;
    if (!response.ok) {
      throw new BaneseAdapterError(
        `O Banese recusou a consulta de recuperacao (${response.status}); nenhum POST foi enviado.`,
      );
    }

    const candidateEndpoint = `${endpoint}/${nossoNumero}`;
    const recoveredResult = await recoveredIncidentResult(
      input.charge,
      input.convenio,
      input.agencia,
      candidateEndpoint,
      input.token,
      raw,
      payload,
    );
    if (!recoveredResult) continue;

    const reservation = await claimBaneseIncidentRecoveredTitle(
      input.charge.admin,
      {
        receivableId: input.receivableId,
        environment: input.charge.environment,
        convenio: input.convenio,
        agencia: input.agencia,
        expectedCreationToken: input.expectedCreationToken,
        nossoNumero,
      },
    );
    return { reservation, recoveredResult };
  }

  const reservation = await finishBaneseIncidentRecoveryScan(
    input.charge.admin,
    {
      receivableId: input.receivableId,
      environment: input.charge.environment,
      convenio: input.convenio,
      agencia: input.agencia,
      expectedCreationToken: input.expectedCreationToken,
    },
  );
  return { reservation, recoveredResult: null };
};
