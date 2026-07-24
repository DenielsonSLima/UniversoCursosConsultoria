import {
  getBanesePixCredentials,
  requestBanesePixAccessToken,
} from "./auth.ts";
import {
  type AdapterCreateChargeInput,
  type AdapterCreateChargeResult,
  BANESE_PIX_ENDPOINTS,
  BaneseAdapterConfigurationError,
  BaneseAdapterError,
} from "./types.ts";
import {
  asRecord,
  assertAmount,
  assertEnvironment,
  extractBanesePayload,
  firstString,
  metadataFrom,
  readResponseBody,
} from "./utils.ts";

export const validateBanesePixChargeInput = async (
  input: AdapterCreateChargeInput,
) => {
  assertEnvironment(input.environment);
  assertAmount(input.amount);
  if (input.environment === "sandbox") {
    throw new BaneseAdapterConfigurationError(
      "Pix Banese esta bloqueado na homologacao: o banco informou que o servico nao esta em funcionamento no sandbox e sera liberado somente em producao.",
    );
  }
  const metadata = metadataFrom(input.receivable || {});
  const credentials = await getBanesePixCredentials(
    input.admin,
    input.environment,
  );
  const convenio = firstString(
    metadata.banesePixConvenio,
    metadata.baneseConvenio,
    metadata.convenio,
  );
  const chave = firstString(
    metadata.banesePixChave,
    metadata.pixChave,
    metadata.chave,
  );
  if (!convenio || !chave) {
    throw new BaneseAdapterConfigurationError(
      "Pix Banese em producao requer convenio e chave Pix do recebedor.",
    );
  }
  return {
    credentials,
    convenio,
    chave,
    pixPayload: extractBanesePayload(
      input.receivable || {},
      "banesePixPayload",
    ),
    pixEndpointPath: firstString(
      metadata.banesePixEndpointPath,
      metadata.pixEndpointPath,
      "/manutencao/guiaVencimentoFuturo",
    ),
  };
};

export const createBanesePixCharge = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  if (input.paymentMethod !== "PIX") {
    throw new BaneseAdapterError("createBanesePixCharge aceita apenas PIX.");
  }

  const validation = await validateBanesePixChargeInput(input);
  if (
    !Object.keys(validation.pixPayload).length || !validation.pixEndpointPath
  ) {
    throw new BaneseAdapterConfigurationError(
      "Pix Banese Card nao foi enviado: o manual SAB Guias exige CodigoBarra de 48 digitos e payload por cobranca. Informe o payload homologado em banesePixPayload. Nenhuma cobranca Pix foi simulada.",
    );
  }

  const token = await requestBanesePixAccessToken(
    input.admin,
    input.environment,
  );
  const endpoint = `${BANESE_PIX_ENDPOINTS[input.environment].baseUrl}${
    validation.pixEndpointPath.startsWith("/")
      ? validation.pixEndpointPath
      : `/${validation.pixEndpointPath}`
  }`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `${token.tokenType} ${token.accessToken}`,
      Terminal: BANESE_PIX_ENDPOINTS[input.environment].terminal,
      "Content-Type": "application/json",
      ...(validation.credentials.crtAccessToken
        ? { CrtAccessToken: validation.credentials.crtAccessToken }
        : {}),
    },
    body: JSON.stringify(validation.pixPayload),
  });
  const raw = await readResponseBody(response);

  if (!response.ok) {
    throw new BaneseAdapterError(
      `Banese Card recusou criacao do Pix (${response.status}): ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
  }

  const rawRecord = asRecord(raw);
  // In SAB Guias, brCodeEMV/dsUrl are the Pix copy-paste payload, while
  // base64/qrCode are QR image data.
  const pixPayload = firstString(
    rawRecord.brCodeEMV,
    rawRecord.dsUrl,
  );
  const pixEncodedImage = firstString(
    rawRecord.base64,
    rawRecord.qrCode,
    rawRecord.qrcode,
    rawRecord.qrCodeBase64,
    rawRecord.qr_code_base64,
  );
  return {
    id: firstString(
      rawRecord.id,
      rawRecord.txid,
      rawRecord.txId,
      rawRecord.TxId,
      rawRecord.identificador,
    ),
    link: pixPayload || firstString(rawRecord.link, rawRecord.url) || null,
    pixPayload: pixPayload || null,
    pixEncodedImage: pixEncodedImage || null,
    status: firstString(rawRecord.status, rawRecord.situacao, "created"),
    raw,
  };
};
