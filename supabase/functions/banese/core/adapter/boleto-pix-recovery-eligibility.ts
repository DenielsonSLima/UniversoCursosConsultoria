import { queryBaneseEffectivePayments } from "./boleto-payment-query.ts";
import {
  type BaneseAccessToken,
  BaneseAdapterError,
} from "./types.ts";
import { asRecord } from "./utils.ts";

export const assertBanesePixRecoveryEligible = async (input: {
  raw: unknown;
  baseEndpoint: string;
  token: BaneseAccessToken;
  signal?: AbortSignal;
}) => {
  const { payments } = await queryBaneseEffectivePayments({
    baseEndpoint: input.baseEndpoint,
    token: input.token,
    signal: input.signal,
    allowFailure: false,
  });
  const boleto = asRecord(input.raw);
  const situationCode = Number(
    boleto.CodigoSituacaoBoleto ?? boleto.codigoSituacaoBoleto,
  );
  if (situationCode !== 2) {
    throw new BaneseAdapterError(
      "O titulo Banese nao esta em situacao 2/PENDING e nao pode receber recuperacao automatica de Pix.",
    );
  }
  if (payments.length > 0) {
    throw new BaneseAdapterError(
      "O titulo Banese possui pagamento efetivado e nao pode receber recuperacao automatica de Pix.",
    );
  }
};
