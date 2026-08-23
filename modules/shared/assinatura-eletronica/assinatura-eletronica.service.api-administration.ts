import type { ElectronicSignatureAdministrationDraft } from "./assinatura-eletronica.contract";
import {
  validateElectronicSignatureModelAssetUpload,
  verifyElectronicSignatureModelAssetDownload,
} from "./assinatura-eletronica.model-asset";
import { normalizeAdministration } from "./assinatura-eletronica.service.administration-normalizers";
import {
  ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT,
  normalizeAssetId,
} from "./assinatura-eletronica.service.shared";
import {
  cleanupModelAsset,
  invokeModelAssets,
  rpcOrThrow,
} from "./assinatura-eletronica.service.transport";

const getModelAsset = async (assetId: string) => {
  const normalizedAssetId = normalizeAssetId(
    assetId,
    "O identificador do ativo da marca-d'água",
  );
  const asset = await invokeModelAssets({
    action: "resolve-preview",
    assetId: normalizedAssetId,
  });
  if (asset.assetId !== normalizedAssetId) {
    throw new Error("A prévia retornou um ativo diferente do solicitado.");
  }
  return asset;
};

export const administrationServiceMethods = {
  getAdministration: (params: {
    poloId?: string | null;
    documentType?: string;
  } = {}) =>
    rpcOrThrow(
      "assinatura_eletronica_obter_configuracao",
      {
        p_polo_id: params.poloId ?? null,
        p_documento: params.documentType ??
          ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT,
      },
      normalizeAdministration,
    ),

  saveAdministration: (params: {
    poloId?: string | null;
    documentType?: string;
    draft: ElectronicSignatureAdministrationDraft;
    expectedVersion: number;
    requestId?: string | null;
  }) => {
    if (
      !Number.isInteger(params.expectedVersion) || params.expectedVersion < 0
    ) {
      throw new Error(
        "A versão-base do modelo não foi informada pelo serviço autorizado.",
      );
    }
    return rpcOrThrow(
      "assinatura_eletronica_salvar_configuracao",
      {
        p_polo_id: params.poloId ?? null,
        p_documento: params.documentType ??
          ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT,
        p_configuracao: {
          ...params.draft,
          expectedVersion: params.expectedVersion,
        },
        p_request_id: params.requestId ?? null,
      },
      normalizeAdministration,
    );
  },

  uploadModelAsset: async (file: File) => {
    await validateElectronicSignatureModelAssetUpload(file);
    const form = new FormData();
    form.append("action", "upload");
    form.append("file", file, file.name || "marca-dagua.png");
    return invokeModelAssets(form);
  },

  getModelAsset,

  getVerifiedModelAsset: async (assetId: string) =>
    verifyElectronicSignatureModelAssetDownload(await getModelAsset(assetId)),

  cleanupModelAsset: async (assetId: string) =>
    cleanupModelAsset(
      normalizeAssetId(assetId, "O identificador do ativo da marca-d'água"),
    ),
};
