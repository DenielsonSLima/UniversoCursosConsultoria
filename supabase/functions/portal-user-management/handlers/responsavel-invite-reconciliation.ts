import { normalizeEmail } from "../auth-users.ts";
import { isUuid } from "../permissions.ts";
import type { HandlerContext } from "../types.ts";

const INVITE_OPERATION_NONCE_KEY = "invite_operation_nonce";
const INVITE_OPERATION_ACTOR_KEY = "invite_operation_actor";
const INVITE_OPERATION_PROOF_KEY = "invite_operation_proof";
const INVITE_OPERATION_VERSION_KEY = "invite_operation_version";
const INVITE_OPERATION_VERSION = "v1";

export const INVITE_RECONCILIATION_PROOF_RPC =
  "portal_identidade_assinar_convite_responsavel";

type InviteAuthUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const requestInviteOperationProof = async (
  context: HandlerContext,
  originalActorAuthUserId: string,
  requestId: string,
  responsavelLegalId: string,
  email: string,
) => {
  const currentActorAuthUserId = String(
    context.gestor?.auth_user_id || "",
  ).trim();
  if (
    !isUuid(currentActorAuthUserId) || !isUuid(originalActorAuthUserId) ||
    !isUuid(requestId) || !isUuid(responsavelLegalId)
  ) {
    throw new Error("CONTRATO_RECONCILIACAO_CONVITE_INVALIDO");
  }

  const { data, error } = await context.admin.rpc(
    INVITE_RECONCILIATION_PROOF_RPC,
    {
      p_current_actor_auth_user_id: currentActorAuthUserId,
      p_original_actor_auth_user_id: originalActorAuthUserId,
      p_request_id: requestId,
      p_responsavel_legal_id: responsavelLegalId,
      p_email: normalizeEmail(email),
    },
  );
  if (error || typeof data !== "string") {
    throw new Error("RECONCILIACAO_CONVITE_INDISPONIVEL");
  }
  const proof = data.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(proof)) {
    throw new Error("PROVA_RECONCILIACAO_CONVITE_INVALIDA");
  }
  return proof;
};

const constantTimeEqual = (left: string, right: string) => {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

/**
 * user_metadata pode ser alterado pelo próprio usuário. O marcador só é
 * aceito quando a HMAC emitida pelo servidor comprova o contexto original.
 */
export const hasValidResponsavelInviteOperationMarker = async (
  context: HandlerContext,
  authUser: InviteAuthUser,
  responsavelLegalId: string,
  email: string,
) => {
  const metadata = authUser.user_metadata || {};
  const originalActorAuthUserId = String(
    metadata[INVITE_OPERATION_ACTOR_KEY] || "",
  );
  const originalRequestId = String(
    metadata[INVITE_OPERATION_NONCE_KEY] || "",
  );
  if (
    String(metadata[INVITE_OPERATION_VERSION_KEY] || "") !==
      INVITE_OPERATION_VERSION ||
    !isUuid(originalActorAuthUserId) ||
    !isUuid(originalRequestId) ||
    metadata.origem !== "cadastro_responsavel_legal" ||
    String(metadata.responsavel_legal_id || "") !== responsavelLegalId ||
    normalizeEmail(authUser.email) !== normalizeEmail(email)
  ) {
    return false;
  }

  const receivedProof = String(
    metadata[INVITE_OPERATION_PROOF_KEY] || "",
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedProof)) return false;
  const expectedProof = await requestInviteOperationProof(
    context,
    originalActorAuthUserId,
    originalRequestId,
    responsavelLegalId,
    email,
  );
  return constantTimeEqual(receivedProof, expectedProof);
};

export const buildResponsavelInviteOperationMetadata = async (
  context: HandlerContext,
  actorAuthUserId: string,
  requestId: string,
  responsavelLegalId: string,
  email: string,
  nome: string,
) => ({
  nome,
  origem: "cadastro_responsavel_legal",
  tipo: "ResponsavelLegal",
  responsavel_legal_id: responsavelLegalId,
  [INVITE_OPERATION_VERSION_KEY]: INVITE_OPERATION_VERSION,
  [INVITE_OPERATION_ACTOR_KEY]: actorAuthUserId,
  [INVITE_OPERATION_NONCE_KEY]: requestId,
  [INVITE_OPERATION_PROOF_KEY]: await requestInviteOperationProof(
    context,
    actorAuthUserId,
    requestId,
    responsavelLegalId,
    email,
  ),
});
