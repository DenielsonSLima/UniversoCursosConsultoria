import {
  CnabParseResult,
  CnabParseSummary,
  ImportOutcome,
  ParsedEvent,
  ParsedSegmentT,
} from "./banese-cnab240.types.ts";
import { cnab240Field } from "./banese-cnab240.codec.ts";
import {
  parseCnabDateDDMMYYYY,
  parseCnabReasonCodes,
  validateBaneseCnab240Return,
  ValidatedCnab240Record,
} from "./banese-cnab240.validator.ts";

type TextLike = string | number | boolean | null | undefined;

const onlyDigits = (value: TextLike) => String(value ?? "").replace(/\D/g, "");

export const normalizeLine = (line: TextLike) =>
  String(line ?? "").replace(/\r/g, "");

const toAmount = (raw: TextLike) => {
  const value = String(raw ?? "");
  if (!/^\d+$/.test(value)) return 0;
  return Number((Number(value) / 100).toFixed(2));
};

const normalizeNossoNumero = (raw: TextLike) => {
  const digits = onlyDigits(raw);
  if (!digits || /^0+$/.test(digits)) {
    return { value: null as string | null, valid: false };
  }
  return {
    value: digits.slice(-9).padStart(9, "0"),
    valid: true,
  };
};

export const isBanesePaidMovement = (movementCode: string) =>
  movementCode === "06" || movementCode === "17";

const parseSegmentT = (record: ValidatedCnab240Record): ParsedSegmentT => {
  const nosso = normalizeNossoNumero(cnab240Field(record.text, 38, 57));
  return {
    linha: record.lineNumber,
    lote: record.lote,
    sequence: record.sequence ?? 0,
    movement: cnab240Field(record.text, 16, 17) || null,
    nossoNumero: nosso.value,
    nossoValido: nosso.valid,
    nominalAmount: toAmount(cnab240Field(record.text, 82, 96)),
    liquidationReasonCodes: parseCnabReasonCodes(
      cnab240Field(record.text, 214, 223),
    ).codes,
    rawLine: record.text,
  };
};

const parseSegmentU = (record: ValidatedCnab240Record) => ({
  linha: record.lineNumber,
  lote: record.lote,
  sequence: record.sequence ?? 0,
  movement: cnab240Field(record.text, 16, 17),
  paymentAmount: toAmount(cnab240Field(record.text, 78, 92)),
  occurrenceDate: parseCnabDateDDMMYYYY(
    cnab240Field(record.text, 138, 145),
  ).value,
  rawLine: record.text,
});

const emptySummary = (fileLines: number): CnabParseSummary => ({
  fileLines,
  segmentT: 0,
  segmentU: 0,
  events: 0,
  matched: 0,
  paid: 0,
  notFound: 0,
  conflicts: 0,
  errors: 0,
  skipped: 0,
});

const validationOutcomes = (
  validation: ReturnType<typeof validateBaneseCnab240Return>,
): ImportOutcome[] =>
  validation.issues.map((entry) => ({
    row: entry.lineNumber,
    nossoNumero: "--------",
    status: "error",
    action: entry.code.toLowerCase(),
    message: entry.message,
  }));

const parseRecordLines = (rawContent: string): CnabParseResult => {
  const validation = validateBaneseCnab240Return(rawContent);
  const summary = emptySummary(validation.lineCount);
  summary.segmentT =
    validation.records.filter((record) => record.segment === "T").length;
  summary.segmentU =
    validation.records.filter((record) => record.segment === "U").length;

  if (!validation.valid) {
    summary.errors = validation.issues.length;
    summary.skipped = summary.segmentU;
    return {
      summary,
      events: [],
      outcomes: validationOutcomes(validation),
    };
  }

  const events: ParsedEvent[] = validation.pairs.map(
    ({ segmentT, segmentU }) => {
      const parsedT = parseSegmentT(segmentT);
      const parsedU = parseSegmentU(segmentU);
      const movementCode = parsedU.movement;
      const paid = isBanesePaidMovement(movementCode);
      return {
        lineNumber: parsedU.linha,
        lote: parsedU.lote,
        nossoNumero: parsedT.nossoNumero!,
        movementCode,
        nominalAmount: parsedT.nominalAmount,
        paidAmount: parsedU.paymentAmount,
        occurrenceDate: parsedU.occurrenceDate,
        segmentTMovement: parsedT.movement,
        liquidationReasonCodes: parsedT.liquidationReasonCodes,
        settlementChannel: paid
          ? (parsedT.liquidationReasonCodes.includes("61") ? "PIX" : "BOLETO")
          : null,
        paid,
        rawTLine: parsedT.rawLine,
        rawULine: parsedU.rawLine,
      };
    },
  );

  summary.events = events.length;
  return { summary, events, outcomes: [] };
};

export const parseCnab240Payload = (payload: string | undefined | null) =>
  parseRecordLines(String(payload ?? ""));

export const parsePayloadText = (body: unknown) => {
  if (typeof body !== "object" || body === null) return "";
  const value = body as Record<string, unknown>;
  if (
    typeof value.fileContentBase64 === "string" &&
    value.fileContentBase64.trim()
  ) {
    try {
      return atob(value.fileContentBase64.trim());
    } catch (_error) {
      return "";
    }
  }
  return typeof value.fileContent === "string" ? value.fileContent : "";
};
