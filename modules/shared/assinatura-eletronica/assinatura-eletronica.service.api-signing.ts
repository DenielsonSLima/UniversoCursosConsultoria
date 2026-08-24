import type {
  ElectronicSignatureConsentEvidence,
  ElectronicSignatureInbox,
  ElectronicSignatureProfile,
} from "./assinatura-eletronica.contract";
import { getInboxSection } from "./assinatura-eletronica.service.api-archive";
import {
  normalizeConfirmation,
  normalizeReauthentication,
} from "./assinatura-eletronica.service.envelope-normalizers";
import {
  DEFAULT_INBOX_EMPTY_MESSAGE,
  ElectronicSignatureRequestError,
  normalizeRequiredSha256,
  requiredBoundedString,
  requiredUuid,
} from "./assinatura-eletronica.service.shared";
import { invokeReauthentication } from "./assinatura-eletronica.service.transport";

export const signingServiceMethods = {
  reauthenticateForSignature: (params: {
    envelopeId: string;
    participantId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
    requestId: string;
    password: string;
    consent: ElectronicSignatureConsentEvidence;
  }) => {
    const password = params.password;
    if (!password || password.length > 512) {
      throw new ElectronicSignatureRequestError(
        "Informe sua senha atual para continuar.",
        "INVALID_REQUEST",
        400,
        null,
      );
    }
    const requestId = requiredUuid(params.requestId, "A chave da assinatura");
    const envelopeId = requiredUuid(
      params.envelopeId,
      "O envelope da assinatura",
    );
    const participantId = requiredUuid(
      params.participantId,
      "O participante da assinatura",
    );
    const contextId = requiredUuid(
      params.contextId,
      "O contexto da assinatura",
    );
    if (params.consent?.accepted !== true) {
      throw new ElectronicSignatureRequestError(
        "Confirme o aceite do termo para continuar.",
        "INVALID_REQUEST",
        400,
        null,
      );
    }
    const consent: ElectronicSignatureConsentEvidence = {
      accepted: true,
      termId: requiredBoundedString(
        params.consent.termId,
        "O identificador do termo de aceite",
        160,
      ),
      sha256: normalizeRequiredSha256(
        params.consent.sha256,
        "O hash do termo de aceite",
      ),
    };
    return invokeReauthentication(
      {
        action: "REAUTHENTICATE",
        envelopeId,
        participantId,
        profile: params.profile,
        contextId,
        requestId,
        password,
        consent,
      },
      (value) => {
        const result = normalizeReauthentication(value, requestId);
        if (
          result.envelopeId !== envelopeId ||
          result.participantId !== participantId ||
          result.profile !== params.profile ||
          result.contextId !== contextId
        ) {
          throw new Error(
            "A reautenticação não corresponde ao envelope e ao perfil solicitados.",
          );
        }
        return result;
      },
    );
  },

  confirmSignature: (params: {
    requestId: string;
    ticket: string;
  }) => {
    const requestId = requiredUuid(params.requestId, "A chave da assinatura");
    return invokeReauthentication(
      {
        action: "CONFIRM_SIGNATURE",
        requestId,
        ticket: requiredBoundedString(
          params.ticket,
          "O ticket de reautenticação",
          2_048,
        ),
      },
      (value) => normalizeConfirmation(value, requestId),
    );
  },

  getInbox: async (params: {
    profile: ElectronicSignatureProfile;
    contextId: string;
    poloId?: string | null;
    limit?: number;
  }): Promise<ElectronicSignatureInbox> => {
    const [pending, signed] = await Promise.all([
      getInboxSection({ ...params, status: "PENDENTES" }),
      getInboxSection({ ...params, status: "ASSINADOS" }),
    ]);
    return {
      pending: pending.items,
      signed: signed.items,
      pendingEmptyMessage: DEFAULT_INBOX_EMPTY_MESSAGE,
      signedEmptyMessage: DEFAULT_INBOX_EMPTY_MESSAGE,
    };
  },
};
