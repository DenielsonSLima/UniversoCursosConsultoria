import { applyCnab240Event } from "./banese-cnab240.transaction.ts";
import {
  BaneseCnabImportResult,
  CnabParseResult,
  ImportEventResult,
} from "./banese-cnab240.types.ts";
import {
  parseCnab240Payload,
  parsePayloadText,
} from "./banese-cnab240.parser.ts";

const nextImportId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `cnab240-${timestamp}-${random}`;
};

const safeEnv = (value: unknown): "sandbox" | "production" =>
  value === "production" ? "production" : "sandbox";

const summarizeEvent = (
  summary: CnabParseResult["summary"],
  result: ImportEventResult,
) => {
  if (result.action === "conflict") summary.conflicts += 1;
  if (result.action === "not_found") summary.notFound += 1;
  if (result.action === "paid") summary.paid += 1;
  if (result.action !== "not_found") summary.matched += 1;
  return summary;
};

export const importBaneseCnab240Return = async (
  admin: any,
  body: any = {},
) => {
  const fileContent = parsePayloadText(body);
  const fileName = typeof body.fileName === "string" && body.fileName.trim()
    ? body.fileName.trim()
    : null;
  const requestedEnvironment = safeEnv(body.environment);
  const importedAt = new Date().toISOString();
  const importId = nextImportId();

  if (!fileContent.trim()) {
    throw new Error("Arquivo CNAB240 vazio ou inválido.");
  }

  const parseResult = parseCnab240Payload(fileContent);
  const summary = parseResult.summary;
  const events = parseResult.events;
  const outcomes = [...parseResult.outcomes];

  if (!events.length) {
    return {
      success: true,
      importId,
      fileName,
      importedAt,
      summary,
      outcomes,
      message: "Arquivo processado sem segmentos U.",
    } as BaneseCnabImportResult;
  }

  for (const event of events) {
    try {
      const result = await applyCnab240Event(
        admin,
        requestedEnvironment,
        event,
        fileName,
        importId,
      );
      summarizeEvent(summary, result);
      outcomes.push({
        row: event.lineNumber,
        nossoNumero: event.nossoNumero,
        status: result.status,
        action: result.action,
        message: result.message,
      });
    } catch (error) {
      summary.errors += 1;
      outcomes.push({
        row: event.lineNumber,
        nossoNumero: event.nossoNumero,
        status: "error",
        action: "exception",
        message: error instanceof Error
          ? error.message
          : "Erro ao processar evento CNAB240.",
      });
    }
  }

  return {
    success: summary.errors === 0,
    importId,
    fileName,
    importedAt,
    summary,
    outcomes,
  } as BaneseCnabImportResult;
};
