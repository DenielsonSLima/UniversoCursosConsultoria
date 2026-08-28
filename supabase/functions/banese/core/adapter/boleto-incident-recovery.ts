import {
  claimBaneseIncidentRecoveredTitle,
  finishBaneseIncidentRecoveryScan,
} from "./auth.ts";
import { buildBaneseBoletoPayload } from "./boleto-payload.ts";
import {
  boletoResultFromResponse,
  validateBaneseBoletoResponse,
} from "./boleto-response.ts";
import { normalizeBaneseFinancialTerms } from "../../internal/financial-terms.ts";
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
  raw: unknown,
  payload: ReturnType<typeof buildBaneseBoletoPayload>,
): Promise<AdapterCreateChargeResult | null> => {
  const metadata = metadataFrom(charge.receivable || {});
  try {
    validateBaneseBoletoResponse(raw, {
      ourNumber: payload.NossoNumero,
      amount: payload.ValorNominal,
      dueDate: payload.DataVencimento,
      agency: agencia,
      account: metadata.baneseConta ?? metadata.baneseContaDisplay,
      documentNumber: payload.NumeroDocumento,
      companyTitleId: payload.IdTituloEmpresa,
      payerDocument: payload.Pagador.NumeroCPFCNPJ,
    });
  } catch {
    return null;
  }
  const pix = await normalizeBanesePixFromResponses(
    [{ source: "confirmation", raw }],
    charge.amount,
  );
  if (!pix.pixPayload || !pix.pixEncodedImage) return null;
  const result = boletoResultFromResponse(
    { ...charge, financialTerms: null },
    payload,
    convenio,
    agencia,
    raw,
    false,
  );
  return withRequiredBaneseProductionPix({
    ...result,
    financialTerms: charge.financialTerms
      ? normalizeBaneseFinancialTerms(charge.financialTerms)
      : null,
    raw: {
      ...asRecord(result.raw),
      recovered: true,
      recoveryEvidence: "BANK_NUMBERS_AND_OFFICIAL_PIX",
    },
  }, pix);
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

    const recoveredResult = await recoveredIncidentResult(
      input.charge,
      input.convenio,
      input.agencia,
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
