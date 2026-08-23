import type { ElectronicSignatureModelAsset } from "./assinatura-eletronica.contract";
import { ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS } from "./assinatura-eletronica.contract";
import {
  asRecord,
  assertExactKeys,
  normalizeAssetId,
  requiredInteger,
  requiredString,
  stringValue,
} from "./assinatura-eletronica.service.shared";

export const normalizeModelAsset = (
  value: unknown,
): ElectronicSignatureModelAsset => {
  const source = asRecord(
    value,
    "O ativo da marca-d'água retornou um formato inválido.",
  );
  const hasCamelCaseKeys = Object.prototype.hasOwnProperty.call(
    source,
    "assetId",
  );
  assertExactKeys(
    source,
    hasCamelCaseKeys
      ? [
        "assetId",
        "signedUrl",
        "mimeType",
        "byteSize",
        "width",
        "height",
        "sha256",
        "expiresIn",
      ]
      : [
        "asset_id",
        "signed_url",
        "mime_type",
        "byte_size",
        "width",
        "height",
        "sha256",
        "expires_in",
      ],
    "O ativo da marca-d'água",
  );
  const assetId = normalizeAssetId(
    hasCamelCaseKeys ? source.assetId : source.asset_id,
    "O identificador do ativo da marca-d'água",
  );
  const signedUrl = stringValue(
    hasCamelCaseKeys ? source.signedUrl : source.signed_url,
    "A URL temporária do ativo da marca-d'água",
    16 * 1024,
  ).trim();
  if (!/^https:\/\//iu.test(signedUrl)) {
    throw new Error(
      "A URL temporária do ativo da marca-d'água não é autorizada.",
    );
  }
  const mimeType = requiredString(
    hasCamelCaseKeys ? source.mimeType : source.mime_type,
    "O tipo do ativo da marca-d'água",
  );
  if (mimeType !== "image/png") {
    throw new Error("O ativo da marca-d'água não é uma imagem PNG autorizada.");
  }
  const byteSize = requiredInteger(
    hasCamelCaseKeys ? source.byteSize : source.byte_size,
    "O tamanho do ativo da marca-d'água",
  );
  if (
    byteSize < 1 || byteSize > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxBytes
  ) {
    throw new Error(
      "O tamanho do ativo da marca-d'água está fora do limite autorizado.",
    );
  }
  const width = requiredInteger(
    source.width,
    "A largura do ativo da marca-d'água",
  );
  const height = requiredInteger(
    source.height,
    "A altura do ativo da marca-d'água",
  );
  if (
    width < 1 ||
    height < 1 ||
    width > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxDimension ||
    height > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxDimension ||
    width * height > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxPixels
  ) {
    throw new Error(
      "As dimensões do ativo da marca-d'água estão fora do limite autorizado.",
    );
  }
  const sha256 = requiredString(
    source.sha256,
    "O hash do ativo da marca-d'água",
  )
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    throw new Error("O hash do ativo da marca-d'água não é válido.");
  }
  const expiresIn = requiredInteger(
    hasCamelCaseKeys ? source.expiresIn : source.expires_in,
    "A validade da URL temporária do ativo da marca-d'água",
  );
  if (expiresIn < 1 || expiresIn > 86_400) {
    throw new Error(
      "A validade da URL temporária do ativo da marca-d'água está fora do limite autorizado.",
    );
  }
  return {
    assetId,
    signedUrl,
    mimeType,
    byteSize,
    width,
    height,
    sha256,
    expiresIn,
  };
};
