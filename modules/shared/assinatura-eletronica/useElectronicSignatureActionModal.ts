import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ElectronicSignatureArtifactDownload } from "./assinatura-eletronica.contract";
import { electronicSignatureQueryKeys } from "./assinatura-eletronica.contract";
import {
  ElectronicSignatureRequestError,
  electronicSignatureService,
} from "./assinatura-eletronica.service";
import {
  clearElectronicSignatureRequestId,
  getOrCreateElectronicSignatureRequestId,
} from "./electronic-signature-request-id";
import {
  electronicSignatureErrorMessage,
  newRequestId,
} from "./ElectronicSignatureActionModal.helpers";
import type { ElectronicSignatureActionModalProps } from "./ElectronicSignatureActionModal.types";
import { useElectronicSignatureDialogFocus } from "./useElectronicSignatureDialogFocus";

export const useElectronicSignatureActionModal = ({
  isOpen,
  item,
  profile,
  contextId,
  poloId = null,
  onClose,
}: ElectronicSignatureActionModalProps) => {
  const queryClient = useQueryClient();
  const requestIdRef = useRef<string | null>(null);
  const ticketRef = useRef<{ value: string; expiresAt: number } | null>(null);
  const mountedRef = useRef(true);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const submittingRef = useRef(false);
  const actionIdentity = `${profile}:${contextId}:${
    item?.envelopeId || "sem-envelope"
  }:${item?.participantId || "sem-participante"}`;
  const activeActionIdentityRef = useRef(actionIdentity);
  activeActionIdentityRef.current = actionIdentity;
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [finalizationFailure, setFinalizationFailure] = useState<string | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isOpeningOriginal, setIsOpeningOriginal] = useState(false);
  const [originalFailure, setOriginalFailure] = useState<string | null>(null);
  const [originalNotice, setOriginalNotice] = useState<string | null>(null);
  const [originalDownload, setOriginalDownload] = useState<
    ElectronicSignatureArtifactDownload | null
  >(null);

  closeRef.current = onClose;
  submittingRef.current = isSubmitting || isFinalizing;

  const detailQuery = useQuery({
    queryKey: electronicSignatureQueryKeys.envelope(
      profile,
      contextId,
      item?.envelopeId || "sem-envelope",
    ),
    queryFn: () => {
      if (!item) throw new Error("O envelope não foi selecionado.");
      return electronicSignatureService.getEnvelope({
        envelopeId: item.envelopeId,
        profile,
        contextId,
      });
    },
    enabled: isOpen && Boolean(item && contextId),
    staleTime: 0,
    retry: false,
  });
  const canonicalParticipant = detailQuery.data?.participant;
  const isSignatureCandidate = Boolean(
    item?.canAct &&
      item.primaryAction === "SIGN" &&
      item.participantId &&
      canonicalParticipant?.canAct &&
      canonicalParticipant.participantId === item.participantId,
  );
  const consentTermQuery = useQuery({
    queryKey: electronicSignatureQueryKeys.consentTerm(
      profile,
      contextId,
      item?.envelopeId || "sem-envelope",
      item?.participantId || "sem-participante",
    ),
    queryFn: () => {
      if (!item?.participantId) {
        throw new Error("O participante não foi selecionado.");
      }
      return electronicSignatureService.getConsentTerm({
        envelopeId: item.envelopeId,
        participantId: item.participantId,
        profile,
        contextId,
      });
    },
    enabled: isOpen && Boolean(contextId) && isSignatureCandidate,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ticketRef.current = null;
      requestIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    setPassword("");
    setFailure(null);
    setSuccessMessage(null);
    setIsSubmitting(false);
    setIsFinalizing(false);
    setFinalizationFailure(null);
    setConsentAccepted(false);
    setIsOpeningOriginal(false);
    setOriginalFailure(null);
    setOriginalNotice(null);
    setOriginalDownload(null);
    ticketRef.current = null;
    requestIdRef.current = null;
  }, [contextId, isOpen, item?.envelopeId, item?.participantId, profile]);

  useEffect(() => {
    setConsentAccepted(false);
    ticketRef.current = null;
    requestIdRef.current = null;
  }, [consentTermQuery.data?.sha256, consentTermQuery.data?.termId]);

  useElectronicSignatureDialogFocus({
    isOpen,
    dialogRef,
    submittingRef,
    closeRef,
  });

  if (!isOpen || !item || typeof document === "undefined") return null;

  const detail = detailQuery.data;
  const isSignatureAction = item.canAct && item.primaryAction === "SIGN";
  const canSign = isSignatureCandidate;
  const consentTerm = consentTermQuery.data;
  const canRequestOriginal = Boolean(
    (profile === "PROFESSOR" || profile === "COORDENADOR") &&
      detail?.envelope.original.ready,
  );
  const hasValidTicket = Boolean(
    ticketRef.current && ticketRef.current.expiresAt > Date.now(),
  );
  const canonicalParticipants = detail?.participants ?? [];
  const canRecoverFinalization = Boolean(
    item.participantId &&
      canonicalParticipant?.participantId === item.participantId &&
      canonicalParticipant.status === "ASSINADO" &&
      canonicalParticipant.order === canonicalParticipants.length &&
      canonicalParticipants.length > 0 &&
      canonicalParticipants.every((participant) =>
        participant.status === "ASSINADO"
      ) &&
      detail?.envelope.status === "FINALIZANDO" &&
      !detail.envelope.final.ready,
  );

  const closeSafely = () => {
    if (isSubmitting || isFinalizing) return;
    onClose();
  };

  const invalidateCanonicalState = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: [
          "assinatura-eletronica",
          "inbox",
          profile,
          contextId,
          poloId,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: electronicSignatureQueryKeys.envelope(
          profile,
          contextId,
          item.envelopeId,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: electronicSignatureQueryKeys.diaryEnvelopes(),
      }),
    ]);
  };

  const finalizeOfficialDiary = async () => {
    const scope = [profile, contextId, item.envelopeId] as const;
    const requestId = getOrCreateElectronicSignatureRequestId(
      "FINALIZE_DIARY",
      scope,
    );
    const result = await electronicSignatureService.processDiaryArtifact({
      action: "FINALIZE",
      envelopeId: item.envelopeId,
      requestId,
    });
    clearElectronicSignatureRequestId("FINALIZE_DIARY", scope);
    await invalidateCanonicalState();
    return result;
  };

  const retryFinalization = async () => {
    if (!canRecoverFinalization && !finalizationFailure) return;
    setFinalizationFailure(null);
    setFailure(null);
    setIsFinalizing(true);
    try {
      await finalizeOfficialDiary();
      if (!mountedRef.current) return;
      setSuccessMessage(
        "Sua assinatura foi registrada e o documento final oficial foi preparado.",
      );
    } catch (error) {
      if (mountedRef.current) {
        setFinalizationFailure(electronicSignatureErrorMessage(error));
      }
    } finally {
      if (mountedRef.current) setIsFinalizing(false);
    }
  };

  const openAuthorizedUrl = (download: ElectronicSignatureArtifactDownload) => {
    if (typeof window === "undefined") return;
    const previewWindow = window.open(download.url, "_blank");
    if (previewWindow) {
      previewWindow.opener = null;
      setOriginalNotice(null);
    } else {
      setOriginalNotice(
        "O navegador bloqueou a nova aba. Use o link temporário exibido abaixo.",
      );
    }
  };

  const openOriginalDocument = async () => {
    if (typeof window === "undefined") return;
    if (!canRequestOriginal || !consentTerm) return;
    if (
      originalDownload && Date.parse(originalDownload.expiresAt) > Date.now()
    ) {
      openAuthorizedUrl(originalDownload);
      return;
    }
    const operationIdentity = actionIdentity;
    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = "Autorizando documento…";
      previewWindow.document.body.textContent =
        "Autorizando acesso temporário ao PDF…";
    }
    const scope = [
      profile,
      contextId,
      item.envelopeId,
      "DOCUMENTO_ORIGINAL",
    ] as const;
    setIsOpeningOriginal(true);
    setOriginalFailure(null);
    setOriginalNotice(null);
    try {
      const requestId = getOrCreateElectronicSignatureRequestId(
        "CREATE_ARTIFACT_DOWNLOAD_URL",
        scope,
      );
      if (profile !== "PROFESSOR" && profile !== "COORDENADOR") {
        throw new Error(
          "Este perfil não possui uma classe de leitura autorizada para o original.",
        );
      }
      const download = await electronicSignatureService
        .createArtifactDownloadUrl({
          envelopeId: item.envelopeId,
          artifactClass: "DOCUMENTO_ORIGINAL",
          profile,
          contextId,
          requestId,
        });
      clearElectronicSignatureRequestId("CREATE_ARTIFACT_DOWNLOAD_URL", scope);
      if (
        !mountedRef.current ||
        activeActionIdentityRef.current !== operationIdentity
      ) {
        previewWindow?.close();
        return;
      }
      setOriginalDownload(download);
      if (previewWindow && !previewWindow.closed) {
        previewWindow.location.replace(download.url);
      } else {
        setOriginalNotice(
          "O navegador bloqueou a nova aba. Use o link temporário exibido abaixo.",
        );
      }
    } catch (error) {
      previewWindow?.close();
      if (
        mountedRef.current &&
        activeActionIdentityRef.current === operationIdentity
      ) {
        setOriginalFailure(electronicSignatureErrorMessage(error));
      }
    } finally {
      if (
        mountedRef.current &&
        activeActionIdentityRef.current === operationIdentity
      ) {
        setIsOpeningOriginal(false);
      }
    }
  };

  const confirm = async () => {
    if (!canSign || !item.participantId) return;
    if (!consentTerm || !consentAccepted) {
      setFailure(
        "Leia o termo e marque o aceite antes de confirmar a assinatura.",
      );
      return;
    }
    if (!canRequestOriginal) {
      setFailure(
        "O PDF original ainda não está disponível para conferência neste perfil.",
      );
      return;
    }
    let currentTicket = ticketRef.current;
    if (currentTicket && currentTicket.expiresAt <= Date.now()) {
      ticketRef.current = null;
      requestIdRef.current = null;
      currentTicket = null;
    }
    if (!currentTicket && !password) {
      setFailure("O prazo da confirmação expirou. Digite sua senha novamente.");
      return;
    }
    setFailure(null);
    setFinalizationFailure(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const requestId = requestIdRef.current || newRequestId();
      requestIdRef.current = requestId;
      if (!currentTicket) {
        const reauthentication = await electronicSignatureService
          .reauthenticateForSignature({
            envelopeId: item.envelopeId,
            participantId: item.participantId,
            profile,
            contextId,
            requestId,
            password,
            consent: {
              accepted: true,
              termId: consentTerm.termId,
              sha256: consentTerm.sha256,
            },
          });
        setPassword("");
        ticketRef.current = {
          value: reauthentication.ticket,
          expiresAt: Date.parse(reauthentication.expiresAt),
        };
      }

      const activeTicket = ticketRef.current;
      if (!activeTicket) {
        throw new Error("O serviço não emitiu a confirmação de identidade.");
      }
      const result = await electronicSignatureService.confirmSignature({
        requestId,
        ticket: activeTicket.value,
      });
      ticketRef.current = null;
      requestIdRef.current = null;
      if (!mountedRef.current) return;
      if (result.requiresFinalization) {
        try {
          await finalizeOfficialDiary();
          if (mountedRef.current) {
            setSuccessMessage(
              "Sua assinatura foi registrada e o documento final oficial foi preparado.",
            );
          }
        } catch (error) {
          if (!mountedRef.current) return;
          setFinalizationFailure(electronicSignatureErrorMessage(error));
          await invalidateCanonicalState();
        }
      } else {
        setSuccessMessage(
          result.nextParticipantRole
            ? "Sua assinatura foi registrada. O documento seguiu para o próximo participante."
            : "Sua assinatura foi registrada com sucesso.",
        );
        await invalidateCanonicalState();
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (
        error instanceof ElectronicSignatureRequestError &&
        [
          "REAUTH_TICKET_INVALID",
          "REAUTH_TICKET_EXPIRED",
          "REAUTH_TICKET_CONSUMED",
        ].includes(error.code)
      ) {
        ticketRef.current = null;
        requestIdRef.current = null;
      }
      setFailure(electronicSignatureErrorMessage(error));
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  return {
    canRecoverFinalization,
    canRequestOriginal,
    canSign,
    canonicalParticipant,
    closeSafely,
    confirm,
    consentAccepted,
    consentTerm,
    consentTermQuery,
    detail,
    detailQuery,
    dialogRef,
    failure,
    finalizationFailure,
    hasValidTicket,
    isFinalizing,
    isOpeningOriginal,
    isSignatureAction,
    isSubmitting,
    item,
    onClose,
    openOriginalDocument,
    originalDownload,
    originalFailure,
    originalNotice,
    password,
    retryFinalization,
    setConsentAccepted,
    setFailure,
    setPassword,
    successMessage,
  };
};

export type ElectronicSignatureActionModalController = NonNullable<
  ReturnType<typeof useElectronicSignatureActionModal>
>;
