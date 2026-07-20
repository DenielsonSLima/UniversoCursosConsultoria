import {
  CnabParseResult,
  CnabParseSummary,
  ImportOutcome,
  ParsedEvent,
  ParsedSegmentT,
} from "./banese-cnab240.types.ts";

type TextLike = string | number | boolean | null | undefined;

const onlyDigits = (value: TextLike) => String(value || "").replace(/\D/g, "");

export const normalizeLine = (line: TextLike) => String(line ?? "").replace(/\r/g, "");

const ensure240 = (line: string) => line.padEnd(240, " ").slice(0, 240);

const slice = (line: string, start: number, end: number) => ensure240(line)
  .slice(start - 1, end);

const toDateFromYYYYMMDD = (raw: TextLike) => {
  const digits = onlyDigits(raw);
  if (!/^\d{8}$/.test(digits)) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(date.getTime())) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
};

const toAmount = (raw: TextLike) => {
  const digits = onlyDigits(raw);
  if (!digits) return 0;
  return Number((Number(digits) / 100).toFixed(2));
};

const normalizeNossoNumero = (raw: TextLike, allowLog?: boolean) => {
  const digits = onlyDigits(raw);
  if (!digits) return { value: null as string | null, valid: false };
  if (digits.length === 9) {
    return { value: digits, valid: true };
  }
  if (digits.length > 9) {
    return { value: digits.slice(-9).padStart(9, "0"), valid: true };
  }
  if (allowLog) {
    return { value: digits.padStart(9, "0"), valid: true };
  }
  return { value: null, valid: false };
};

const isPaidMovement = (movementCode: string) => movementCode === "06" ||
  movementCode === "09" ||
  movementCode === "17";

const parseHeader = (line: string, lineNumber: number) => {
  const recordType = slice(line, 8, 8).trim();
  const segment = slice(line, 14, 14).trim().toUpperCase();
  const lote = slice(line, 4, 7).trim();
  return { recordType, segment, lote, lineNumber };
};

const parseSegmentT = (line: string, lineNumber: number) => {
  const lote = slice(line, 4, 7).trim();
  const tMovement = slice(line, 16, 17).trim();
  const nosso = normalizeNossoNumero(slice(line, 38, 57));
  return {
    linha: lineNumber,
    lote,
    movement: tMovement || null,
    nossoNumero: nosso.value,
    nossoValido: nosso.valid,
    rawLine: normalizeLine(line),
  };
};

const parseSegmentU = (line: string, lineNumber: number) => {
  const movement = slice(line, 16, 17).trim();
  const paymentAmount = toAmount(slice(line, 78, 92));
  const occurrenceDate = toDateFromYYYYMMDD(slice(line, 138, 145));
  const correspondentNosso = normalizeNossoNumero(slice(line, 214, 233), true).value;
  return {
    linha: lineNumber,
    movement,
    paymentAmount,
    occurrenceDate,
    correspondentNosso: correspondentNosso || null,
    rawLine: normalizeLine(line),
  };
};

const parseRecordLines = (rawContent: string): CnabParseResult => {
  const lines = rawContent.split("\n");
  const pendingByLote = new Map<string, ParsedSegmentT[]>();
  const events: ParsedEvent[] = [];
  const outcomes: ImportOutcome[] = [];
  const summary: CnabParseSummary = {
    fileLines: lines.length,
    segmentT: 0,
    segmentU: 0,
    events: 0,
    matched: 0,
    paid: 0,
    notFound: 0,
    conflicts: 0,
    errors: 0,
    skipped: 0,
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = normalizeLine(lines[index] || "");
    if (!rawLine.trim()) continue;
    const lineNumber = index + 1;
    const parsed = parseHeader(rawLine, lineNumber);
    if (parsed.recordType !== "3") continue;

    if (parsed.segment === "T") {
      summary.segmentT += 1;
      const segmentT = parseSegmentT(rawLine, lineNumber);
      if (!segmentT.nossoNumero && !segmentT.nossoValido) {
        outcomes.push({
          row: lineNumber,
          nossoNumero: "--------",
          status: "error",
          action: "parse_t",
          message: "Segmento T sem Nosso Numero em 38-57.",
        });
        summary.errors += 1;
        continue;
      }
      const queue = pendingByLote.get(segmentT.lote) || [];
      queue.push(segmentT);
      pendingByLote.set(segmentT.lote, queue);
      continue;
    }

    if (parsed.segment !== "U") continue;

    summary.segmentU += 1;
    const segmentU = parseSegmentU(rawLine, lineNumber);
    const loteQueue = pendingByLote.get(parsed.lote) || [];
    const linkedT = loteQueue.shift() || null;
    if (loteQueue.length) {
      pendingByLote.set(parsed.lote, loteQueue);
    } else if (linkedT) {
      pendingByLote.delete(parsed.lote);
    }

    const ourFromU = segmentU.correspondentNosso;
    const ourFromT = linkedT?.nossoNumero || null;
    const nossoNumero = ourFromU || ourFromT;

    if (!nossoNumero) {
      outcomes.push({
        row: lineNumber,
        nossoNumero: "--------",
        status: "warning",
        action: "pairing",
        message: "Segmento U sem Nosso Numero e sem contexto de segmento T.",
      });
      summary.errors += 1;
      summary.skipped += 1;
      continue;
    }

    const movementCode = segmentU.movement.padStart(2, "0");
    const paid = isPaidMovement(movementCode);
    events.push({
      lineNumber,
      lote: parsed.lote,
      nossoNumero,
      movementCode,
      paidAmount: segmentU.paymentAmount,
      occurrenceDate: segmentU.occurrenceDate,
      segmentTMovement: linkedT?.movement || null,
      paid,
      rawTLine: linkedT?.rawLine || null,
      rawULine: rawLine,
    });
  }

  summary.events = events.length;
  return { summary, events, outcomes };
};

export const parseCnab240Payload = (payload: string | undefined | null) =>
  parseRecordLines(String(payload || ""));

export const parsePayloadText = (body: any) => {
  if (typeof body !== "object" || body === null) {
    return "";
  }
  if (typeof body.fileContentBase64 === "string" && body.fileContentBase64.trim()) {
    try {
      return atob(body.fileContentBase64.trim());
    } catch (_error) {
      return "";
    }
  }
  if (typeof body.fileContent === "string") {
    return body.fileContent;
  }
  return "";
};

