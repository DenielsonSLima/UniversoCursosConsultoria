import { supabase } from "../../../lib/supabase";

import type {
  ElectronicSignatureArtifactClass,
  ElectronicSignatureArtifactDownload,
  ElectronicSignatureArtifactProfile,
  ElectronicSignatureDiaryArtifactAction,
  ElectronicSignatureModelAsset,
} from "./assinatura-eletronica.contract";
import { normalizeArtifactDownload } from "./assinatura-eletronica.service.archive-normalizers";
import { normalizeDiaryArtifact } from "./assinatura-eletronica.service.envelope-normalizers";
import { normalizeModelAsset } from "./assinatura-eletronica.service.model-asset-normalizer";
import {
  ELECTRONIC_SIGNATURE_ARCHIVE_FUNCTION,
  ELECTRONIC_SIGNATURE_DIARY_ARTIFACTS_FUNCTION,
  ELECTRONIC_SIGNATURE_MODEL_ASSETS_FUNCTION,
  ELECTRONIC_SIGNATURE_REAUTHENTICATION_FUNCTION,
  ElectronicSignatureRequestError,
} from "./assinatura-eletronica.service.shared";
import { toElectronicSignatureRpcError } from "./assinatura-eletronica.rpc-error";

export const rpcOrThrow = async <T>(
  name: string,
  args: Record<string, unknown>,
  normalize: (value: unknown) => T,
): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toElectronicSignatureRpcError(error);
  return normalize(data);
};

export const invokeReauthentication = async <T>(
  body: Record<string, unknown>,
  normalize: (value: unknown) => T,
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_REAUTHENTICATION_FUNCTION,
    { body },
  );
  if (error) {
    const response = error.context && typeof error.context.clone === "function"
      ? error.context.clone()
      : error.context;
    const payload = response && typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;
    const failure = payload && typeof payload === "object" && payload.error &&
        typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
    throw new ElectronicSignatureRequestError(
      typeof failure?.message === "string"
        ? failure.message
        : "Não foi possível confirmar sua identidade para esta assinatura.",
      typeof failure?.code === "string" ? failure.code : "SERVICE_UNAVAILABLE",
      response && typeof response.status === "number" ? response.status : null,
      typeof failure?.retryAfterSeconds === "number"
        ? failure.retryAfterSeconds
        : null,
    );
  }
  return normalize(data);
};

export const invokeArchiveArtifact = async (
  body: {
    action: "CREATE_DOWNLOAD_URL";
    envelopeId: string;
    artifactClass: ElectronicSignatureArtifactClass;
    profile: ElectronicSignatureArtifactProfile;
    contextId: string;
    requestId: string;
  },
): Promise<ElectronicSignatureArtifactDownload> => {
  const { data, error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_ARCHIVE_FUNCTION,
    { body },
  );
  if (error) {
    const response = error.context && typeof error.context.clone === "function"
      ? error.context.clone()
      : error.context;
    const payload = response && typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;
    const failure = payload && typeof payload === "object" && payload.error &&
        typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
    throw new ElectronicSignatureRequestError(
      typeof failure?.message === "string"
        ? failure.message
        : "Não foi possível autorizar o acesso a este documento.",
      typeof failure?.code === "string" ? failure.code : "SERVICE_UNAVAILABLE",
      response && typeof response.status === "number" ? response.status : null,
      null,
    );
  }
  return normalizeArtifactDownload(data, {
    requestId: body.requestId,
    envelopeId: body.envelopeId,
    artifactClass: body.artifactClass,
  });
};

export const invokeDiaryArtifacts = async (
  action: ElectronicSignatureDiaryArtifactAction,
  envelopeId: string,
  requestId: string,
) => {
  const { data, error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_DIARY_ARTIFACTS_FUNCTION,
    { body: { action, envelopeId, requestId } },
  );
  if (error) {
    const response = error.context && typeof error.context.clone === "function"
      ? error.context.clone()
      : error.context;
    const payload = response && typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;
    const failure = payload && typeof payload === "object" && payload.error &&
        typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
    throw new ElectronicSignatureRequestError(
      typeof failure?.message === "string"
        ? failure.message
        : "Não foi possível processar o documento oficial do diário.",
      typeof failure?.code === "string" ? failure.code : "SERVICE_UNAVAILABLE",
      response && typeof response.status === "number" ? response.status : null,
      null,
    );
  }
  return normalizeDiaryArtifact(data, envelopeId);
};

export const invokeModelAssets = async (
  body: FormData | Record<string, unknown>,
): Promise<ElectronicSignatureModelAsset> => {
  const { data, error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_MODEL_ASSETS_FUNCTION,
    { body },
  );
  if (error) throw error;
  return normalizeModelAsset(data);
};

export const cleanupModelAsset = async (assetId: string): Promise<void> => {
  const { error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_MODEL_ASSETS_FUNCTION,
    { body: { action: "cleanup", assetId } },
  );
  if (error) throw error;
};
