import type {
  ElectronicSignatureArchiveCursor,
  ElectronicSignatureArchiveFilters,
  ElectronicSignatureArtifactClass,
  ElectronicSignatureArtifactProfile,
  ElectronicSignatureInboxCursor,
  ElectronicSignatureProfile,
} from "./assinatura-eletronica.contract";
import {
  normalizeArchiveDateRange,
  normalizeArchivePage,
  normalizeArtifactClass,
  normalizeArtifactProfile,
} from "./assinatura-eletronica.service.archive-normalizers";
import { normalizeConsentTerm } from "./assinatura-eletronica.service.consent-normalizers";
import { normalizeEnvelopeDetail } from "./assinatura-eletronica.service.envelope-normalizers";
import { normalizeInboxPage } from "./assinatura-eletronica.service.inbox-normalizers";
import {
  requiredTimestamp,
  requiredUuid,
} from "./assinatura-eletronica.service.shared";
import {
  invokeArchiveArtifact,
  rpcOrThrow,
} from "./assinatura-eletronica.service.transport";

export const getInboxSection = (params: {
  profile: ElectronicSignatureProfile;
  contextId: string;
  poloId?: string | null;
  status: "PENDENTES" | "ASSINADOS";
  limit?: number;
  cursor?: ElectronicSignatureInboxCursor | null;
}) =>
  rpcOrThrow(
    "assinatura_eletronica_listar_caixa_contexto",
    {
      p_perfil: params.profile,
      p_context_id: requiredUuid(
        params.contextId,
        "O contexto da caixa de assinaturas",
      ),
      p_status: params.status,
      p_polo_id: params.poloId
        ? requiredUuid(params.poloId, "O polo da caixa de assinaturas")
        : null,
      p_limite: params.limit ?? 50,
      p_cursor_updated_at: params.cursor?.updatedAt ?? null,
      p_cursor_envelope_id: params.cursor?.envelopeId ?? null,
    },
    normalizeInboxPage,
  );

export const archiveServiceMethods = {
  getInboxSection,

  listGestorArchive: (params: {
    contextId: string;
    poloId?: string | null;
    filters: ElectronicSignatureArchiveFilters;
    limit?: number;
    cursor?: ElectronicSignatureArchiveCursor | null;
  }) => {
    if (!["TODOS", "ASSINADO", "SUBSTITUIDO"].includes(params.filters.status)) {
      throw new Error("O filtro de status do acervo não foi reconhecido.");
    }
    if (
      params.filters.documentType !== null &&
      params.filters.documentType !== "diario_classe"
    ) {
      throw new Error("O filtro de documento do acervo não foi reconhecido.");
    }
    const search = params.filters.search.trim();
    if (search.length > 120) {
      throw new Error("A busca do acervo excedeu o limite autorizado.");
    }
    if (
      [...params.filters.search].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      })
    ) {
      throw new Error("A busca do acervo contém caracteres inválidos.");
    }
    const limit = params.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("O tamanho da página do acervo é inválido.");
    }
    const range = normalizeArchiveDateRange(params.filters);
    const cursor = params.cursor
      ? {
        finalizedAt: requiredTimestamp(
          params.cursor.finalizedAt,
          "A finalização do cursor do acervo",
        ),
        envelopeId: requiredUuid(
          params.cursor.envelopeId,
          "O envelope do cursor do acervo",
        ),
      }
      : null;
    return rpcOrThrow(
      "assinatura_eletronica_listar_acervo_gestor",
      {
        p_context_id: requiredUuid(params.contextId, "O contexto do acervo"),
        p_polo_id: params.poloId
          ? requiredUuid(params.poloId, "O polo do acervo")
          : null,
        p_documento: params.filters.documentType,
        p_status: params.filters.status,
        p_busca: search || null,
        p_turma_id: params.filters.turmaId
          ? requiredUuid(params.filters.turmaId, "A turma do acervo")
          : null,
        p_finalizado_de: range.finalizedFrom,
        p_finalizado_ate: range.finalizedToExclusive,
        p_limite: limit,
        p_cursor_finalizado_em: cursor?.finalizedAt ?? null,
        p_cursor_envelope_id: cursor?.envelopeId ?? null,
      },
      normalizeArchivePage,
    );
  },

  getEnvelope: (params: {
    envelopeId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
  }) =>
    rpcOrThrow(
      "assinatura_eletronica_obter_envelope",
      {
        p_envelope_id: requiredUuid(params.envelopeId, "O envelope solicitado"),
        p_perfil: params.profile,
        p_context_id: requiredUuid(params.contextId, "O contexto do envelope"),
      },
      normalizeEnvelopeDetail,
    ),

  getConsentTerm: (params: {
    envelopeId: string;
    participantId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
  }) =>
    rpcOrThrow(
      "assinatura_eletronica_obter_termo",
      {
        p_envelope_id: requiredUuid(
          params.envelopeId,
          "O envelope do termo de aceite",
        ),
        p_participante_id: requiredUuid(
          params.participantId,
          "O participante do termo de aceite",
        ),
        p_perfil: params.profile,
        p_context_id: requiredUuid(
          params.contextId,
          "O contexto do termo de aceite",
        ),
      },
      normalizeConsentTerm,
    ),

  createArtifactDownloadUrl: (params: {
    envelopeId: string;
    artifactClass: ElectronicSignatureArtifactClass;
    profile: ElectronicSignatureArtifactProfile;
    contextId: string;
    requestId: string;
  }) => {
    const body = {
      action: "CREATE_DOWNLOAD_URL" as const,
      envelopeId: requiredUuid(params.envelopeId, "O envelope do artefato"),
      artifactClass: normalizeArtifactClass(params.artifactClass),
      profile: normalizeArtifactProfile(params.profile),
      contextId: requiredUuid(params.contextId, "O contexto do artefato"),
      requestId: requiredUuid(params.requestId, "A chave do download"),
    };
    return invokeArchiveArtifact(body);
  },
};
