import { normalizeEmail } from "../auth-users.ts";
import { isUuid } from "../permissions.ts";
import type { HandlerContext } from "../types.ts";

const INVITE_OPERATION_NONCE_KEY = "invite_operation_nonce";
const INVITE_OPERATION_ACTOR_KEY = "invite_operation_actor";
const INVITE_OPERATION_PROOF_KEY = "invite_operation_proof";
const INVITE_OPERATION_VERSION_KEY = "invite_operation_version";
const INVITE_OPERATION_VERSION = "v1";

export const GESTOR_INVITE_RECONCILIATION_PROOF_RPC =
  "portal_identidade_assinar_convite_gestor";

type GestorInviteAuthUser = {
  email?: string | null;
  invited_at?: string | null;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const requestInviteOperationProof = async (
  context: HandlerContext,
  originalActorAuthUserId: string,
  requestId: string,
  email: string,
  cpf: string,
) => {
  const currentActorAuthUserId = String(
    context.gestor?.auth_user_id || "",
  ).trim();
  if (
    !isUuid(currentActorAuthUserId) || !isUuid(originalActorAuthUserId) ||
    !isUuid(requestId)
  ) {
    throw new Error("CONTRATO_RECONCILIACAO_CONVITE_GESTOR_INVALIDO");
  }

  const { data, error } = await context.admin.rpc(
    GESTOR_INVITE_RECONCILIATION_PROOF_RPC,
    {
      p_current_actor_auth_user_id: currentActorAuthUserId,
      p_original_actor_auth_user_id: originalActorAuthUserId,
      p_request_id: requestId,
      p_email: normalizeEmail(email),
      p_cpf: onlyDigits(cpf),
    },
  );
  if (error || typeof data !== "string") {
    throw new Error("RECONCILIACAO_CONVITE_GESTOR_INDISPONIVEL");
  }
  const proof = data.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(proof)) {
    throw new Error("PROVA_RECONCILIACAO_CONVITE_GESTOR_INVALIDA");
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

export const hasValidGestorInviteOperationMarker = async (
  context: HandlerContext,
  authUser: GestorInviteAuthUser,
  email: string,
  cpf: string,
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
    !isUuid(originalActorAuthUserId) || !isUuid(originalRequestId) ||
    metadata.origem !== "usuarios_sistema" ||
    normalizeEmail(authUser.email) !== normalizeEmail(email) ||
    onlyDigits(metadata.cpf) !== onlyDigits(cpf)
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
    email,
    cpf,
  );
  return constantTimeEqual(receivedProof, expectedProof);
};

/**
 * Compatibilidade restrita para convites criados antes da prova HMAC. Apenas
 * identidades realmente convidadas, nunca confirmadas e nunca usadas entram
 * na reconciliação; cadastros comuns ou contas OAuth continuam recusados.
 */
export const isLegacyPendingGestorInvite = (
  authUser: GestorInviteAuthUser,
  email: string,
) => {
  const metadata = authUser.user_metadata || {};
  return metadata.origem === "usuarios_sistema" &&
    isUuid(String(metadata[INVITE_OPERATION_NONCE_KEY] || "")) &&
    normalizeEmail(authUser.email) === normalizeEmail(email) &&
    Boolean(authUser.invited_at) &&
    !authUser.confirmed_at &&
    !authUser.email_confirmed_at &&
    !authUser.last_sign_in_at;
};

export const buildGestorInviteOperationMetadata = async (
  context: HandlerContext,
  requestId: string,
  email: string,
  cpf: string,
  nome: string,
) => {
  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  return {
    nome,
    origem: "usuarios_sistema",
    cpf: onlyDigits(cpf),
    [INVITE_OPERATION_VERSION_KEY]: INVITE_OPERATION_VERSION,
    [INVITE_OPERATION_ACTOR_KEY]: actorAuthUserId,
    [INVITE_OPERATION_NONCE_KEY]: requestId,
    [INVITE_OPERATION_PROOF_KEY]: await requestInviteOperationProof(
      context,
      actorAuthUserId,
      requestId,
      email,
      cpf,
    ),
  };
};
