import {
  assertBaneseFinancialTermsEqual,
  baneseFinancialTermsFromPayload,
} from "../../internal/financial-terms-response.ts";
import {
  type BaneseFinancialTermsInput,
  type BaneseFinancialTermsPayload,
  mapBaneseFinancialTermsToPayload,
  normalizeBaneseFinancialTerms,
} from "../../internal/financial-terms.ts";
import { requestBaneseBoletoAccessToken } from "./auth.ts";
import {
  BANESE_BOLETO_ENDPOINTS,
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
  onlyDigits,
  pickRecord,
  readResponseBody,
  sanitizedBoletoSnapshot,
} from "./utils.ts";

type BaneseFinancialPayload = BaneseFinancialTermsPayload & {
  ValorNominal: number;
  DataVencimento: string;
};

const boletoFinancialTermsPayload = (payload: BaneseFinancialPayload) =>
  pickRecord(payload, ["Desconto", "Juros", "Multa"]);

const readBaneseBoletoAt = async (
  endpoint: string,
  token: BaneseAccessToken,
) => {
  const response = await fetch(endpoint, {
    headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
  });
  const raw = await readResponseBody(response);
  return { response, raw };
};

export const confirmBaneseBoletoFinancialTerms = async (input: {
  endpoint: string;
  token: BaneseAccessToken;
  payload: BaneseFinancialPayload;
  currentRaw?: unknown;
  repairMismatch: boolean;
}) => {
  const expected = baneseFinancialTermsFromPayload(
    input.payload,
    input.payload.ValorNominal,
    input.payload.DataVencimento,
  );
  let raw = input.currentRaw;
  if (!raw) {
    const current = await readBaneseBoletoAt(input.endpoint, input.token);
    if (!current.response.ok) {
      throw new BaneseAdapterError(
        `Nao foi possivel confirmar os termos do boleto Banese (${current.response.status}).`,
      );
    }
    raw = current.raw;
  }

  try {
    assertBaneseFinancialTermsEqual(
      expected,
      baneseFinancialTermsFromPayload(
        raw,
        input.payload.ValorNominal,
        input.payload.DataVencimento,
      ),
    );
    return raw;
  } catch (error) {
    if (!input.repairMismatch) throw error;
  }

  const rawRecord = asRecord(raw);
  const situationCode = Number(
    rawRecord.CodigoSituacaoBoleto ?? rawRecord.codigoSituacaoBoleto,
  );
  if (situationCode !== 2) {
    throw new BaneseAdapterError(
      "Termos financeiros divergentes so podem ser corrigidos em titulo Banese pendente.",
    );
  }
  const updatePayload = boletoFinancialTermsPayload(input.payload);
  if (!Object.keys(updatePayload).length) {
    throw new BaneseAdapterError(
      "Titulo Banese possui termos inesperados e a remocao automatica foi bloqueada.",
    );
  }
  const updateResponse = await fetch(input.endpoint, {
    method: "PUT",
    headers: {
      Authorization: `${input.token.tokenType} ${input.token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updatePayload),
  });
  const updateRaw = await readResponseBody(updateResponse);
  if (!updateResponse.ok) {
    throw new BaneseAdapterError(
      `Banese recusou a correcao dos termos do boleto (${updateResponse.status}): ${
        typeof updateRaw === "string" ? updateRaw : JSON.stringify(updateRaw)
      }`,
    );
  }

  const confirmed = await readBaneseBoletoAt(input.endpoint, input.token);
  if (!confirmed.response.ok) {
    throw new BaneseAdapterError(
      `Banese alterou o boleto, mas a confirmacao falhou (${confirmed.response.status}).`,
    );
  }
  assertBaneseFinancialTermsEqual(
    expected,
    baneseFinancialTermsFromPayload(
      confirmed.raw,
      input.payload.ValorNominal,
      input.payload.DataVencimento,
    ),
  );
  return confirmed.raw;
};

export const ensureBaneseBoletoFinancialTerms = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  input: {
    convenio: unknown;
    nossoNumero: unknown;
    nominalAmount: number;
    dueDate: string;
    financialTerms: BaneseFinancialTermsInput;
  },
) => {
  assertEnvironment(environment);
  const convenio = onlyDigits(input.convenio);
  const nossoNumero = onlyDigits(input.nossoNumero);
  if (!convenio || !/^\d{9}$/.test(nossoNumero)) {
    throw new BaneseAdapterConfigurationError(
      "Correcao de termos Banese requer convenio e Nosso Numero validos.",
    );
  }
  const financialTerms = normalizeBaneseFinancialTerms({
    ...input.financialTerms,
    nominalAmount: input.nominalAmount,
    dueDate: input.dueDate,
  });
  const payload: BaneseFinancialPayload = {
    ValorNominal: financialTerms.nominalAmount,
    DataVencimento: financialTerms.dueDate,
    ...mapBaneseFinancialTermsToPayload(financialTerms),
  };
  const token = await requestBaneseBoletoAccessToken(admin, environment);
  const endpoint = `${
    BANESE_BOLETO_ENDPOINTS[environment].baseUrl
  }/convenios/${convenio}/boletos/${nossoNumero}`;
  const current = await readBaneseBoletoAt(endpoint, token);
  if (!current.response.ok) {
    throw new BaneseAdapterError(
      `Nao foi possivel consultar o boleto antes de confirmar seus termos (${current.response.status}).`,
    );
  }
  const currentRecord = asRecord(current.raw);
  const remoteAmount = Number(
    currentRecord.ValorNominal ?? currentRecord.valorNominal,
  );
  const remoteDueDate = firstString(
    currentRecord.DataVencimento,
    currentRecord.dataVencimento,
  ).slice(0, 10);
  const remoteOurNumber = onlyDigits(
    currentRecord.NossoNumero ?? currentRecord.nossoNumero,
  ).padStart(9, "0");
  if (
    Math.abs(remoteAmount - financialTerms.nominalAmount) > 0.001 ||
    remoteDueDate !== financialTerms.dueDate ||
    remoteOurNumber !== nossoNumero
  ) {
    throw new BaneseAdapterError(
      "Boleto remoto diverge do recebivel; termos financeiros nao foram alterados.",
    );
  }
  const confirmedRaw = await confirmBaneseBoletoFinancialTerms({
    endpoint,
    token,
    payload,
    currentRaw: current.raw,
    repairMismatch: environment === "sandbox",
  });
  return {
    financialTerms,
    raw: sanitizedBoletoSnapshot(confirmedRaw),
  };
};
