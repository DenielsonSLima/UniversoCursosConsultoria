export const TRANSCRIPTION_NOTICE_VERSION = "whatsapp-transcription-privacy-v1";

export class TranscriptionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type ReadEnvironment = (name: string) => string | undefined;

export const requireTranscriptionApproval = (
  readEnvironment: ReadEnvironment,
  acknowledgement: { noticeVersion?: unknown; noticeAccepted?: unknown },
) => {
  const enabled = readEnvironment("WHATSAPP_TRANSCRIPTION_ENABLED") === "true";
  const approval = readEnvironment("WHATSAPP_TRANSCRIPTION_APPROVAL_REFERENCE")?.trim();
  if (!enabled || !approval || !/^[a-zA-Z0-9._/-]{5,120}$/.test(approval)) {
    throw new TranscriptionError(
      "transcription_disabled",
      "A transcrição por IA está desativada. A instituição precisa aprovar a finalidade e o compartilhamento antes de habilitá-la.",
      403,
    );
  }
  if (acknowledgement.noticeVersion !== TRANSCRIPTION_NOTICE_VERSION
    || acknowledgement.noticeAccepted !== true) {
    throw new TranscriptionError(
      "transcription_notice_required",
      "Leia o aviso de envio do áudio à OpenAI e confirme esta transcrição.",
      400,
    );
  }
};

interface TranscriptionInput {
  messageType: unknown;
  readEnvironment: ReadEnvironment;
  acknowledgement: { noticeVersion?: unknown; noticeAccepted?: unknown };
  download: () => Promise<{ bytes: Uint8Array; mime: string }>;
  fetcher?: typeof fetch;
}

/** Retorna texto efêmero; não recebe cliente de banco nem persiste o áudio/texto. */
export const transcribeApprovedAudio = async ({
  messageType, readEnvironment, acknowledgement, download, fetcher = fetch,
}: TranscriptionInput): Promise<string> => {
  requireTranscriptionApproval(readEnvironment, acknowledgement);
  if (messageType !== "audio") {
    throw new TranscriptionError("invalid_audio", "Apenas mensagens de áudio podem ser transcritas.", 400);
  }
  const apiKey = readEnvironment("OPENAI_API_KEY")?.trim();
  if (!apiKey) {
    throw new TranscriptionError("transcription_unavailable", "O serviço de transcrição está indisponível.", 503);
  }
  try {
    const media = await download();
    const mime = media.mime.split(";")[0].trim().toLowerCase();
    const extensions: Record<string, string> = {
      "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a",
      "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav",
      "audio/x-wav": "wav", "audio/webm": "webm", "audio/ogg": "ogg",
      "audio/flac": "flac", "audio/x-flac": "flac",
    };
    if (!Object.hasOwn(extensions, mime) || media.bytes.byteLength === 0
      || media.bytes.byteLength > 16 * 1024 * 1024) {
      throw new TranscriptionError("invalid_audio", "O áudio não possui formato ou tamanho permitido para transcrição.", 400);
    }
    const form = new FormData();
    form.append("model", readEnvironment("OPENAI_TRANSCRIBE_MODEL")?.trim() || "gpt-4o-mini-transcribe");
    // O nome original pode identificar uma pessoa; não é necessário ao fornecedor.
    const extension = extensions[mime];
    form.append("file", new Blob([new Uint8Array(media.bytes)], { type: mime }), `audio.${extension}`);
    const response = await fetcher("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("provider_failed");
    const payload = await response.json();
    if (typeof payload?.text !== "string" || payload.text.length > 60_000) {
      throw new Error("invalid_provider_response");
    }
    return payload.text.trim();
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;
    throw new TranscriptionError(
      "transcription_failed",
      "Não foi possível transcrever este áudio agora. Tente novamente mais tarde.",
      502,
    );
  }
};
