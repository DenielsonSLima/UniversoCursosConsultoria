export { MERCADO_PAGO_PROVIDER_CODE } from "./constants.ts";
export {
  MercadoPagoAdapterError,
  MercadoPagoAdapterNotImplementedError,
} from "./errors.ts";
export type {
  AdapterCreateChargeInput,
  AdapterCreateChargeResult,
  AdapterPayer,
  AdapterReceivable,
  Environment,
  PaymentMethod,
  SupabaseAdminRpcClient,
} from "./types.ts";
export { getMercadoPagoAccessToken } from "./auth.ts";
export {
  buildMercadoPagoPreferencePayload,
  createMercadoPagoCharge,
  createMercadoPagoPreference,
  paymentMethodOptions,
} from "./preferences.ts";
export { createMercadoPagoPixPayment } from "./pix-orders.ts";

import { MercadoPagoAdapterNotImplementedError } from "./errors.ts";

export const requireMercadoPagoAdapter = (feature: string): never => {
  throw new MercadoPagoAdapterNotImplementedError(feature);
};
