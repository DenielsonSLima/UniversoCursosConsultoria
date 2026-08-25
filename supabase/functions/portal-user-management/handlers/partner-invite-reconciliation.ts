import { normalizeEmail } from "../auth-users.ts";
import { isUuid } from "../permissions.ts";
import type { HandlerContext, Partner } from "../types.ts";

const INVITE_OPERATION_NONCE_KEY = "invite_operation_nonce";
const INVITE_OPERATION_ACTOR_KEY = "invite_operation_actor";
const INVITE_OPERATION_PROOF_KEY = "invite_operation_proof";
const INVITE_OPERATION_VERSION_KEY = "invite_operation_version";
const INVITE_OPERATION_VERSION = "v1";

export const PARTNER_INVITE_RECONCILIATION_PROOF_RPC =
  "portal_identidade_assinar_convite_parceiro";

type PartnerInviteAuthUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type ValidPartnerInviteOperationMarker = Readonly<{
  requestId: string;
  originalActorAuthUserId: string;
}>;

const normalizedRole = (partner: Partner) =>
  String(partner.tipo || "").trim().toUpperCase();

const expectedOrigin = (partner: Partner) =>
  normalizedRole(partner) === "PROFESSOR"
    ? "cadastro_professor"
    : "cadastro_gestor";

const requestInviteOperationProof = async (
  context: HandlerContext,
  originalActorAuthUserId: string,
  requestId: string,
  partner: Partner,
  email: string,
) => {
  const currentActorAuthUserId = String(
    context.gestor?.auth_user_id || "",
  ).trim();
  if (
    !isUuid(currentActorAuthUserId) || !isUuid(originalActorAuthUserId) ||
    !isUuid(requestId) || !isUuid(partner.id) ||
    !["ALUNO", "PROFESSOR"].includes(normalizedRole(partner))
  ) {
    throw new Error("CONTRATO_RECONCILIACAO_CONVITE_PARCEIRO_INVALIDO");
  }

  const { data, error } = await context.admin.rpc(
    PARTNER_INVITE_RECONCILIATION_PROOF_RPC,
    {
      p_current_actor_auth_user_id: currentActorAuthUserId,
      p_original_actor_auth_user_id: originalActorAuthUserId,
      p_request_id: requestId,
      p_partner_id: partner.id,
      p_partner_tipo: normalizedRole(partner),
      p_email: normalizeEmail(email),
    },
  );
  if (error || typeof data !== "string") {
    throw new Error("RECONCILIACAO_CONVITE_PARCEIRO_INDISPONIVEL");
  }
  const proof = data.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(proof)) {
    throw new Error("PROVA_RECONCILIACAO_CONVITE_PARCEIRO_INVALIDA");
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

export const buildPartnerInviteOperationMetadata = async (
  context: HandlerContext,
  requestId: string,
  partner: Partner,
  email: string,
  baseMetadata: Record<string, unknown>,
) => {
  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  return {
    ...baseMetadata,
    origem: expectedOrigin(partner),
    tipo: normalizedRole(partner) === "PROFESSOR" ? "Professor" : "Aluno",
    partner_id: partner.id,
    [INVITE_OPERATION_VERSION_KEY]: INVITE_OPERATION_VERSION,
    [INVITE_OPERATION_ACTOR_KEY]: actorAuthUserId,
    [INVITE_OPERATION_NONCE_KEY]: requestId,
    [INVITE_OPERATION_PROOF_KEY]: await requestInviteOperationProof(
      context,
      actorAuthUserId,
      requestId,
      partner,
      email,
    ),
  };
};

export const readValidPartnerInviteOperationMarker = async (
  context: HandlerContext,
  authUser: PartnerInviteAuthUser,
  partner: Partner,
  email: string,
): Promise<ValidPartnerInviteOperationMarker | null> => {
  const metadata = authUser.user_metadata || {};
  const originalActorAuthUserId = String(
    metadata[INVITE_OPERATION_ACTOR_KEY] || "",
  );
  const requestId = String(metadata[INVITE_OPERATION_NONCE_KEY] || "");
  if (
    String(metadata[INVITE_OPERATION_VERSION_KEY] || "") !==
      INVITE_OPERATION_VERSION ||
    !isUuid(originalActorAuthUserId) || !isUuid(requestId) ||
    metadata.origem !== expectedOrigin(partner) ||
    String(metadata.partner_id || "") !== partner.id ||
    String(metadata.tipo || "").trim().toUpperCase() !==
      normalizedRole(partner) ||
    normalizeEmail(authUser.email) !== normalizeEmail(email)
  ) {
    return null;
  }

  const receivedProof = String(
    metadata[INVITE_OPERATION_PROOF_KEY] || "",
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedProof)) return null;
  const expectedProof = await requestInviteOperationProof(
    context,
    originalActorAuthUserId,
    requestId,
    partner,
    email,
  );
  return constantTimeEqual(receivedProof, expectedProof)
    ? { requestId, originalActorAuthUserId }
    : null;
};

export const hasValidPartnerInviteOperationMarker = async (
  context: HandlerContext,
  authUser: PartnerInviteAuthUser,
  partner: Partner,
  email: string,
) =>
  Boolean(
    await readValidPartnerInviteOperationMarker(
      context,
      authUser,
      partner,
      email,
    ),
  );
