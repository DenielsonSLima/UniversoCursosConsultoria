// Stable public facade for the Banese Card adapter.
import { createBaneseBoletoCharge } from "./adapter/boleto.ts";
import { createBanesePixCharge } from "./adapter/pix.ts";
import {
  type AdapterCreateChargeInput,
  BaneseAdapterError,
  BaneseAdapterNotImplementedError,
} from "./adapter/types.ts";

export {
  allocateBaneseNossoNumero,
  getBaneseBoletoCredentials,
  getBanesePixCredentials,
  getBaneseSecret,
  requestBaneseBoletoAccessToken,
  requestBanesePixAccessToken,
  reserveBaneseNossoNumero,
} from "./adapter/auth.ts";
export {
  createBaneseBoletoCharge,
  queryBaneseBoleto,
} from "./adapter/boleto.ts";
export { cancelBaneseBoleto } from "./adapter/boleto-cancellation.ts";
export {
  buildBaneseBoletoPayload,
  validateBaneseBoletoPayloadInput,
} from "./adapter/boleto-payload.ts";
export { ensureBaneseBoletoFinancialTerms } from "./adapter/boleto-financial-terms.ts";
export { validateBaneseBoletoResponse } from "./adapter/boleto-response.ts";
export {
  createBanesePixCharge,
  validateBanesePixChargeInput,
} from "./adapter/pix.ts";
export {
  BANESE_BOLETO_ENDPOINTS,
  BANESE_BOLETO_STATUS,
  BANESE_PIX_ENDPOINTS,
  BANESE_PROVIDER_CODE,
  BaneseAdapterConfigurationError,
  BaneseAdapterError,
  BaneseAdapterNotImplementedError,
} from "./adapter/types.ts";
export type {
  AdapterCreateChargeInput,
  AdapterCreateChargeResult,
  AdapterPayer,
  AdapterReceivable,
  BaneseAccessToken,
  BaneseBoletoCredentials,
  BaneseClientCredentials,
  BanesePixCredentials,
  Environment,
  PaymentMethod,
  SupabaseAdminRpcClient,
} from "./adapter/types.ts";
export { calculateBaneseNossoNumero } from "./adapter/utils.ts";

export const createBaneseCharge = (input: AdapterCreateChargeInput) => {
  if (input.paymentMethod === "BOLETO") return createBaneseBoletoCharge(input);
  if (input.paymentMethod === "PIX") return createBanesePixCharge(input);
  throw new BaneseAdapterError(
    "Banese Card nao suporta CREDIT_CARD neste adapter.",
  );
};

export const requireBaneseAdapter = (feature: string): never => {
  throw new BaneseAdapterNotImplementedError(feature);
};
