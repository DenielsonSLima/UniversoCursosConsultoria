import {
  applyElectronicSignatureStamps,
  type ApplySignatureStampsInput,
  type FrozenPdfSignatureTarget,
  type InspectedPdfPage,
  inspectPdfOriginal,
} from "../../../shared/assinatura-eletronica/pdf-document-signature.server.ts";
import {
  createElectronicSignatureReceiptPdf,
  type ElectronicSignatureReceiptPayload,
} from "./comprovante-assinatura-eletronica.pdf.ts";

export type ElectronicSignatureReceiptPayloadWithoutHashes =
  & Omit<
    ElectronicSignatureReceiptPayload,
    "document"
  >
  & {
    document: Omit<
      ElectronicSignatureReceiptPayload["document"],
      "originalHash" | "hash"
    >;
  };

export interface CreateSignedPdfArtifactsInput
  extends Omit<ApplySignatureStampsInput, "frozenTarget"> {
  frozenTarget: FrozenPdfSignatureTarget;
  receiptPayload: ElectronicSignatureReceiptPayloadWithoutHashes;
}

export interface SignedPdfArtifacts {
  originalSha256: string;
  finalSha256: string;
  receiptSha256: string;
  finalPdfBytes: Uint8Array;
  receiptPdfBytes: Uint8Array;
  receiptFileName: string;
  originalPageCount: number;
  receiptPageCount: 2;
  targetPageIndex: number;
  targetPage: InspectedPdfPage;
}

const normalizeIdentityText = (value: string) =>
  String(value || "").trim().replace(/\s+/gu, " ");

const assertReceiptMatchesStamps = (input: CreateSignedPdfArtifactsInput) => {
  if (input.receiptPayload.status !== "ASSINADO") {
    throw new Error(
      "O comprovante final precisa representar um envelope assinado.",
    );
  }
  if (input.receiptPayload.participants.length !== input.stamps.length) {
    throw new Error(
      "O comprovante precisa conter todos os signatários carimbados.",
    );
  }

  const expectedValidationUrl = input.verificationUrl;
  if (
    input.receiptPayload.validation.url &&
    input.receiptPayload.validation.url !== expectedValidationUrl
  ) {
    throw new Error(
      "A validação pública do comprovante diverge do código institucional.",
    );
  }

  input.stamps.forEach((stamp) => {
    const documentValidationUrl = new URL(expectedValidationUrl);
    const individualValidationUrl = new URL(stamp.verificationUrl);
    if (
      individualValidationUrl.origin !== documentValidationUrl.origin ||
      individualValidationUrl.pathname !== documentValidationUrl.pathname ||
      individualValidationUrl.searchParams.get("code") !==
        stamp.verificationCode
    ) {
      throw new Error(
        "A URL individual do carimbo diverge da validação pública do comprovante.",
      );
    }
    const participant = input.receiptPayload.participants.find(
      (candidate) => candidate.id === stamp.participantId,
    );
    if (
      !participant ||
      normalizeIdentityText(participant.name) !==
        normalizeIdentityText(stamp.signerName)
    ) {
      throw new Error(
        "O signatário do carimbo diverge entre o documento e o comprovante.",
      );
    }
    const signedAtMillis = new Date(stamp.signedAt).getTime();
    const completionEvent = input.receiptPayload.events.find((event) => (
      event.type === "ASSINATURA_CONCLUIDA" &&
      event.participantId === participant.id &&
      new Date(event.occurredAt).getTime() === signedAtMillis
    ));
    if (!completionEvent) {
      throw new Error(
        "A conclusão da assinatura não corresponde ao instante do carimbo.",
      );
    }
  });

  if (
    new Set(input.stamps.map((stamp) => stamp.participantId)).size !==
      input.stamps.length ||
    new Set(input.stamps.map((stamp) => stamp.verificationUrl)).size !==
      input.stamps.length ||
    new Set(input.stamps.map((stamp) => stamp.signatureEventId)).size !==
      input.stamps.length ||
    new Set(input.stamps.map((stamp) => stamp.signatureHash)).size !==
      input.stamps.length
  ) {
    throw new Error(
      "Cada signatário precisa possuir uma prova individual distinta.",
    );
  }

  const completionEvents = input.receiptPayload.events.filter(
    (event) => event.type === "ASSINATURA_CONCLUIDA",
  );
  if (
    completionEvents.length !== input.stamps.length ||
    completionEvents.some((event) => event.method !== "SENHA_REAUTENTICADA")
  ) {
    throw new Error(
      "Cada assinatura do Diário exige conclusão com senha reautenticada.",
    );
  }
};

/**
 * Orquestra somente bytes e payloads já autorizados por um serviço confiável.
 * Não consulta navegador, banco ou Storage e não concede elegibilidade.
 */
export const createSignedPdfArtifacts = async (
  input: CreateSignedPdfArtifactsInput,
): Promise<SignedPdfArtifacts> => {
  assertReceiptMatchesStamps(input);
  const signed = await applyElectronicSignatureStamps({
    originalBytes: input.originalBytes,
    frozenTarget: input.frozenTarget,
    ...(input.template
      ? { template: input.template, autoLayout: input.autoLayout }
      : { layout: input.layout, contentLayout: input.contentLayout }),
    stampPngBytes: input.stampPngBytes,
    verificationUrl: input.verificationUrl,
    stamps: input.stamps,
  });
  const receipt = await createElectronicSignatureReceiptPdf(
    {
      ...input.receiptPayload,
      document: {
        ...input.receiptPayload.document,
        originalHash: {
          algorithm: "SHA-256",
          value: signed.originalSha256,
        },
        hash: {
          algorithm: "SHA-256",
          value: signed.finalSha256,
        },
      },
    },
    { canonicalValidationUrl: input.verificationUrl },
  );
  const receiptPdfBytes = new Uint8Array(await receipt.blob.arrayBuffer());
  const receiptInspection = await inspectPdfOriginal(receiptPdfBytes);
  if (receiptInspection.pageCount !== 2) {
    throw new Error(
      "O comprovante de assinatura precisa conter exatamente duas páginas.",
    );
  }
  return {
    originalSha256: signed.originalSha256,
    finalSha256: signed.finalSha256,
    receiptSha256: receiptInspection.sha256,
    finalPdfBytes: signed.finalBytes,
    receiptPdfBytes,
    receiptFileName: receipt.fileName,
    originalPageCount: signed.pageCount,
    receiptPageCount: 2,
    targetPageIndex: signed.targetPageIndex,
    targetPage: signed.targetPage,
  };
};
