import {
  ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS,
  type ElectronicSignatureModelAsset,
} from './assinatura-eletronica.contract';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const PNG_HEADER_BYTES = 24;

export interface ElectronicSignatureVerifiedModelAsset extends ElectronicSignatureModelAsset {
  /** Dado efêmero e já conferido; nunca entra no editor persistido. */
  dataUrl: string;
}

const assertPngDimensions = (width: number, height: number, label: string) => {
  const { maxDimension, maxPixels } = ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS;
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > maxDimension
    || height > maxDimension
    || width * height > maxPixels
  ) {
    throw new Error(`${label} excede os limites de 4096 px por lado e 12 megapixels.`);
  }
};

const readPngDimensions = (bytes: Uint8Array, label: string) => {
  if (bytes.length < PNG_HEADER_BYTES) {
    throw new Error(`${label} não possui o cabeçalho PNG completo.`);
  }
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error(`${label} não possui uma assinatura PNG válida.`);
  }
  if (
    bytes[12] !== 73
    || bytes[13] !== 72
    || bytes[14] !== 68
    || bytes[15] !== 82
  ) {
    throw new Error(`${label} não possui um bloco IHDR PNG válido.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  assertPngDimensions(width, height, label);
  return { width, height };
};

const bytesToDataUrl = (bytes: Uint8Array) => {
  if (typeof btoa !== 'function') {
    throw new Error('O navegador não oferece codificação segura para a prévia da imagem.');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/png;base64,${btoa(binary)}`;
};

const digestSha256 = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('A verificação de integridade SHA-256 não está disponível neste navegador.');
  }
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input));
  return Array.from(hash, (part) => part.toString(16).padStart(2, '0')).join('');
};

/**
 * Pré-validação de UX. A Edge Function continua sendo a autoridade para
 * validar o PNG, autorizar o upload e persistir o ativo.
 */
export const validateElectronicSignatureModelAssetUpload = async (file: File): Promise<void> => {
  if (typeof File === 'undefined' || !(file instanceof File)) {
    throw new Error("Selecione uma imagem PNG para a marca-d'água.");
  }
  if (file.type.toLowerCase() !== ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.mimeType) {
    throw new Error('A imagem personalizada deve estar no formato PNG.');
  }
  if (file.size < 1 || file.size > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxBytes) {
    throw new Error('A imagem personalizada deve ter no máximo 1 MiB.');
  }
  const header = new Uint8Array(await file.slice(0, PNG_HEADER_BYTES).arrayBuffer());
  readPngDimensions(header, 'A imagem personalizada');
};

/**
 * Baixa uma URL assinada emitida pela Edge Function e confere exatamente os
 * bytes declarados por ela antes de expor um data URL efêmero ao compositor.
 * Isso não autoriza nem seleciona ativos: apenas falha fechado em divergência.
 */
export const verifyElectronicSignatureModelAssetDownload = async (
  asset: ElectronicSignatureModelAsset,
): Promise<ElectronicSignatureVerifiedModelAsset> => {
  if (!/^https:\/\//iu.test(asset.signedUrl)) {
    throw new Error("A URL assinada da marca-d'água não é autorizada.");
  }
  if (asset.mimeType !== ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.mimeType) {
    throw new Error("O tipo declarado para a marca-d'água não é PNG.");
  }
  if (asset.byteSize < 1 || asset.byteSize > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxBytes) {
    throw new Error("O tamanho declarado para a marca-d'água não é autorizado.");
  }
  assertPngDimensions(asset.width, asset.height, "As dimensões declaradas para a marca-d'água");

  let response: Response;
  try {
    response = await fetch(asset.signedUrl, { cache: 'no-store', mode: 'cors' });
  } catch {
    throw new Error("Não foi possível baixar a imagem personalizada pela URL assinada.");
  }
  if (!response.ok) {
    throw new Error("A URL assinada da imagem personalizada não pôde ser usada.");
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.mimeType) {
    throw new Error("A URL assinada retornou uma imagem com tipo inesperado.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== asset.byteSize) {
    throw new Error("O tamanho baixado da imagem personalizada não corresponde ao ativo autorizado.");
  }
  const dimensions = readPngDimensions(bytes, 'A imagem personalizada baixada');
  if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
    throw new Error("As dimensões baixadas da imagem personalizada não correspondem ao ativo autorizado.");
  }
  const sha256 = await digestSha256(bytes);
  if (sha256 !== asset.sha256.toLowerCase()) {
    throw new Error("A integridade SHA-256 da imagem personalizada não corresponde ao ativo autorizado.");
  }
  return {
    ...asset,
    dataUrl: bytesToDataUrl(bytes),
  };
};
