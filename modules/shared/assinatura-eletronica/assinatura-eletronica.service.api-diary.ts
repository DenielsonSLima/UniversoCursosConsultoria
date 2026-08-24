import type {
  ElectronicSignatureDiaryArtifactAction,
  ElectronicSignatureProfile,
} from "./assinatura-eletronica.contract";
import {
  normalizeDiaryEnvelopeRequest,
  normalizeOptionalEnvelopeDetail,
} from "./assinatura-eletronica.service.envelope-normalizers";
import { requiredUuid } from "./assinatura-eletronica.service.shared";
import {
  invokeDiaryArtifacts,
  rpcOrThrow,
} from "./assinatura-eletronica.service.transport";

export const diaryServiceMethods = {
  getCurrentDiaryEnvelope: (params: {
    turmaId: string;
    disciplinaId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
  }) =>
    rpcOrThrow(
      "assinatura_eletronica_obter_envelope_diario_atual",
      {
        p_turma_id: requiredUuid(params.turmaId, "A turma do diário"),
        p_disciplina_id: requiredUuid(
          params.disciplinaId,
          "A disciplina do diário",
        ),
        p_perfil: params.profile,
        p_context_id: requiredUuid(params.contextId, "O contexto do diário"),
      },
      normalizeOptionalEnvelopeDetail,
    ),

  requestDiaryEnvelope: (params: {
    turmaId: string;
    disciplinaId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
    requestId: string;
  }) =>
    rpcOrThrow(
      "assinatura_eletronica_solicitar_envelope_diario",
      {
        p_turma_id: requiredUuid(params.turmaId, "A turma do diário"),
        p_disciplina_id: requiredUuid(
          params.disciplinaId,
          "A disciplina do diário",
        ),
        p_perfil: params.profile,
        p_context_id: requiredUuid(params.contextId, "O contexto do diário"),
        p_request_id: requiredUuid(
          params.requestId,
          "A chave da solicitação do diário",
        ),
      },
      normalizeDiaryEnvelopeRequest,
    ),

  processDiaryArtifact: (params: {
    action: ElectronicSignatureDiaryArtifactAction;
    envelopeId: string;
    requestId: string;
  }) =>
    invokeDiaryArtifacts(
      params.action,
      requiredUuid(params.envelopeId, "O envelope do artefato"),
      requiredUuid(params.requestId, "A chave do artefato"),
    ),
};
