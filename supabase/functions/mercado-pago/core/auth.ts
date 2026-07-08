import { MERCADO_PAGO_PROVIDER_CODE } from "./constants.ts";
import { MercadoPagoAdapterError } from "./errors.ts";
import type {
  AdapterCreateChargeInput,
  Environment,
  SupabaseAdminRpcClient,
} from "./types.ts";
import { asRecord, firstString, stringValue } from "./utils.ts";
import { assertEnvironment } from "./validators.ts";

const secretName = (environment: Environment, kind: string) =>
  `payment_gateway_${MERCADO_PAGO_PROVIDER_CODE}_${environment}_${kind}`;

const metadataFrom = (input: AdapterCreateChargeInput) => {
  const receivable = asRecord(input.receivable);
  return {
    ...asRecord(input.providerMetadata),
    ...asRecord(receivable.metadata),
    ...asRecord(receivable.gateway_metadata),
    ...asRecord(receivable.payment_gateway_metadata),
    ...asRecord(receivable.provider_metadata),
  };
};

const secretNameFromMetadata = (
  input: AdapterCreateChargeInput,
  kind: string,
) => {
  const metadata = metadataFrom(input);
  const secretNames = asRecord(metadata.secretNames);
  if (kind === "access_token") {
    return firstString(
      secretNames.access_token,
      secretNames.accessToken,
      metadata.accessTokenSecretName,
      metadata.mercadoPagoAccessTokenSecretName,
    );
  }
  return "";
};

export const getMercadoPagoAccessToken = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  input?: AdapterCreateChargeInput,
) => {
  assertEnvironment(environment);
  const selectedSecretName = input
    ? secretNameFromMetadata(input, "access_token") ||
      secretName(environment, "access_token")
    : secretName(environment, "access_token");
  const { data, error } = await admin.rpc("payment_gateway_get_secret", {
    p_secret_name: selectedSecretName,
  });
  if (error) throw error;
  const accessToken = stringValue(data);
  if (!accessToken) {
    throw new MercadoPagoAdapterError(
      `Access token do Mercado Pago nao configurado para ${environment}.`,
    );
  }
  return accessToken;
};
