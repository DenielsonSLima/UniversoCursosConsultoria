import { getCanonicalPdfInlineImage } from "../shared/canonical-document-vector-pdf.core.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import { getDocumentValidationQrValue } from "../../../shared/document-validation/document-validation.qr.ts";
import { createLocalQrCodeDataUrl } from "../../../shared/qrcode/local-qrcode.ts";
import { preparePresentation } from "./comprovante-assinatura-eletronica.editor.ts";
import {
  ELECTRONIC_SIGNATURE_RECEIPT_EVENT_TYPES,
  ELECTRONIC_SIGNATURE_RECEIPT_METHODS,
  ELECTRONIC_SIGNATURE_RECEIPT_STATUSES,
  type ElectronicSignatureReceiptEvent,
  type ElectronicSignatureReceiptEventType,
  type ElectronicSignatureReceiptParticipant,
  type ElectronicSignatureReceiptPayload,
  type ElectronicSignatureReceiptStatus,
  type PreparedElectronicSignatureReceipt,
} from "./comprovante-assinatura-eletronica.types.ts";
import {
  assertIdentifier,
  assertString,
  parseOccurredAt,
  validateHash,
} from "./comprovante-assinatura-eletronica.validation-helpers.ts";

const MAX_PARTICIPANTS = ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS;
const MAX_EVENTS = 8;
const PUBLIC_VALIDATION_QUERY_KEY = "code";

const validatePublicValidationUrl = (
  rawUrl: string,
  expectedCode: string,
  canonicalUrl: string,
) => {
  let url: URL;
  let expectedUrl: URL;
  try {
    url = new URL(rawUrl);
    expectedUrl = new URL(canonicalUrl);
  } catch {
    throw new Error("A URL de validacao do comprovante e invalida.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.origin !== expectedUrl.origin ||
    url.pathname !== expectedUrl.pathname
  ) {
    throw new Error(
      "A URL de validacao do comprovante nao pertence ao validador institucional canonico.",
    );
  }
  const parameters = [...url.searchParams.entries()];
  if (
    parameters.length !== 1 ||
    parameters[0][0] !== PUBLIC_VALIDATION_QUERY_KEY ||
    parameters[0][1] !== expectedCode
  ) {
    throw new Error(
      "A URL de validacao so pode transportar o codigo publico do documento.",
    );
  }
  return url.toString();
};

const assertFinalStatusHasEvidence = (
  status: ElectronicSignatureReceiptStatus,
  events: readonly ElectronicSignatureReceiptEvent[],
) => {
  const requiredEvent: Record<
    ElectronicSignatureReceiptStatus,
    ElectronicSignatureReceiptEventType
  > = {
    ASSINADO: "ASSINATURA_CONCLUIDA",
    RECUSADO: "RECUSA_REGISTRADA",
    CANCELADO: "CANCELAMENTO_REGISTRADO",
    SUBSTITUIDO: "VERSAO_SUBSTITUIDA",
  };
  const finalEvent = events.at(-1);
  if (!finalEvent || finalEvent.type !== requiredEvent[status]) {
    throw new Error(
      `O status ${status} exige o evento terminal correspondente no relatorio de evidencias.`,
    );
  }
  if (
    status === "ASSINADO" && (!finalEvent.participantId || !finalEvent.method)
  ) {
    throw new Error(
      "A assinatura concluida exige participante e metodo de autenticacao no evento terminal.",
    );
  }
  if (
    status === "RECUSADO" && (!finalEvent.participantId || !finalEvent.reason)
  ) {
    throw new Error("A recusa exige participante e motivo no evento terminal.");
  }
  if (status === "CANCELADO" && !finalEvent.reason) {
    throw new Error("O cancelamento exige motivo no evento terminal.");
  }
  if (status === "SUBSTITUIDO" && !finalEvent.reason) {
    throw new Error("A substituicao exige motivo no evento terminal.");
  }
};

export const prepareReceipt = async (
  payload: ElectronicSignatureReceiptPayload,
  canonicalValidationUrl?: string,
): Promise<PreparedElectronicSignatureReceipt> => {
  const documentType = assertString(
    payload.document?.type,
    "O tipo do documento",
    80,
  );
  const reference = assertString(
    payload.document?.reference,
    "A referencia do documento",
    100,
  );
  const version = assertString(
    payload.document?.version,
    "A versao do documento",
    40,
  );
  const originalHash = validateHash(payload.document.originalHash);
  const hash = validateHash(payload.document.hash);
  if (originalHash === hash) {
    throw new Error(
      "Os hashes do documento original e do corpo assinado precisam ser distintos.",
    );
  }
  const presentation = preparePresentation(payload.presentation);
  const status = payload.status;
  if (!ELECTRONIC_SIGNATURE_RECEIPT_STATUSES.includes(status)) {
    throw new Error("O status do comprovante e invalido.");
  }
  if (!Array.isArray(payload.participants) || !payload.participants.length) {
    throw new Error("O comprovante exige ao menos um participante.");
  }
  if (payload.participants.length > MAX_PARTICIPANTS) {
    throw new Error(
      `O comprovante suporta ate ${MAX_PARTICIPANTS} participantes no payload canonico.`,
    );
  }
  if (!Array.isArray(payload.events) || !payload.events.length) {
    throw new Error("O comprovante exige ao menos um evento de evidencia.");
  }
  if (payload.events.length > MAX_EVENTS) {
    throw new Error(
      `O comprovante suporta ate ${MAX_EVENTS} eventos no payload canonico.`,
    );
  }

  const participantsById = new Map<
    string,
    ElectronicSignatureReceiptParticipant
  >();
  payload.participants.forEach((participant, index) => {
    const id = assertIdentifier(
      participant.id,
      `O identificador do participante ${index + 1}`,
    );
    if (participantsById.has(id)) {
      throw new Error(
        "Os participantes do comprovante precisam ter identificadores unicos.",
      );
    }
    participantsById.set(id, {
      id,
      name: assertString(
        participant.name,
        `O nome do participante ${index + 1}`,
        100,
      ),
      role: assertString(
        participant.role,
        `O papel do participante ${index + 1}`,
        80,
      ),
    });
  });

  let previousEventTime = Number.NEGATIVE_INFINITY;
  payload.events.forEach((event, index) => {
    if (!ELECTRONIC_SIGNATURE_RECEIPT_EVENT_TYPES.includes(event.type)) {
      throw new Error(`O tipo do evento ${index + 1} e invalido.`);
    }
    const eventTime = parseOccurredAt(event.occurredAt, `O evento ${index + 1}`)
      .getTime();
    if (eventTime < previousEventTime) {
      throw new Error(
        "Os eventos devem chegar do payload canônico em ordem cronologica.",
      );
    }
    previousEventTime = eventTime;
    if (event.participantId && !participantsById.has(event.participantId)) {
      throw new Error(
        `O evento ${index + 1} referencia um participante inexistente.`,
      );
    }
    if (event.reason) {
      assertString(event.reason, `O motivo do evento ${index + 1}`, 120);
    }
    if (
      event.method &&
      !ELECTRONIC_SIGNATURE_RECEIPT_METHODS.includes(event.method)
    ) {
      throw new Error(`O metodo do evento ${index + 1} e invalido.`);
    }
  });
  assertFinalStatusHasEvidence(status, payload.events);

  const validationCode = assertIdentifier(
    payload.validation?.code,
    "O codigo de validacao",
  );
  const generatedUrl = canonicalValidationUrl ||
    getDocumentValidationQrValue(validationCode);
  const validationUrl = validatePublicValidationUrl(
    payload.validation.url || generatedUrl,
    validationCode,
    generatedUrl,
  );
  const qrDataUrl = await createLocalQrCodeDataUrl(validationUrl, {
    size: 640,
    margin: 1,
    errorCorrectionLevel: "H",
  });
  const qr = getCanonicalPdfInlineImage(qrDataUrl);
  if (!qr) throw new Error("Nao foi possivel preparar o QR Code de validacao.");

  return {
    payload: {
      ...payload,
      presentation,
      document: {
        ...payload.document,
        type: documentType,
        reference,
        version,
        originalHash: { ...payload.document.originalHash, value: originalHash },
        hash: { ...payload.document.hash, value: hash },
      },
      participants: [...participantsById.values()],
    },
    validationUrl,
    validationCode,
    qr,
    participantsById,
  };
};

