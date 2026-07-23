import {
  CNAB240_RECORD_LENGTH,
  cnab240Field,
  Cnab240Line,
  splitCnab240Lines,
} from "./banese-cnab240.codec.ts";

export type Cnab240ValidationIssue = {
  lineNumber: number;
  code: string;
  message: string;
};

export type ValidatedCnab240Record = Cnab240Line & {
  lote: string;
  recordType: string;
  sequence: number | null;
  segment: string | null;
};

export type Cnab240ReturnPair = {
  segmentT: ValidatedCnab240Record;
  segmentU: ValidatedCnab240Record;
};

export type BaneseCnab240Validation = {
  valid: boolean;
  lineCount: number;
  records: ValidatedCnab240Record[];
  pairs: Cnab240ReturnPair[];
  issues: Cnab240ValidationIssue[];
};

const field = cnab240Field;
const digits = (value: string) => /^\d+$/.test(value);
const C047_ALPHA_REASON_CODES = new Set([
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A8",
  "A9",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "ZY",
  "ZZ",
  "ZW",
]);

const integerField = (value: string) => digits(value) ? Number(value) : null;

export const parseCnabDateDDMMYYYY = (raw: string) => {
  const value = String(raw ?? "").trim();
  if (!value || value === "00000000") {
    return { value: null as string | null, valid: true, empty: true };
  }
  if (!/^\d{8}$/.test(value)) {
    return { value: null as string | null, valid: false, empty: false };
  }
  const day = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const year = Number(value.slice(4, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return {
    value: valid
      ? `${value.slice(4, 8)}-${value.slice(2, 4)}-${value.slice(0, 2)}`
      : null,
    valid,
    empty: false,
  };
};

export const parseCnabReasonCodes = (raw: string) => {
  const codes: string[] = [];
  const invalidChunks: string[] = [];
  const value = String(raw ?? "");
  if (value.length !== 10) {
    return { codes, invalidChunks: [value] };
  }
  for (let index = 0; index < value.length; index += 2) {
    const chunk = value.slice(index, index + 2);
    if (chunk === "  " || chunk === "00") continue;
    if (/^\d{2}$/.test(chunk) || C047_ALPHA_REASON_CODES.has(chunk)) {
      codes.push(chunk);
    } else invalidChunks.push(chunk);
  }
  return { codes, invalidChunks };
};

const issue = (
  issues: Cnab240ValidationIssue[],
  lineNumber: number,
  code: string,
  message: string,
) => issues.push({ lineNumber, code, message });

const validateFileEnvelope = (
  records: ValidatedCnab240Record[],
  issues: Cnab240ValidationIssue[],
) => {
  if (!records.length) {
    issue(issues, 0, "EMPTY_FILE", "Arquivo CNAB240 vazio.");
    return;
  }

  const header = records[0];
  if (header.recordType !== "0" || header.lote !== "0000") {
    issue(
      issues,
      header.lineNumber,
      "INVALID_FILE_HEADER",
      "Primeiro registro deve ser o header de arquivo (lote 0000, tipo 0).",
    );
  } else {
    if (field(header.text, 143, 143) !== "2") {
      issue(
        issues,
        header.lineNumber,
        "NOT_RETURN_FILE",
        "Header nao identifica arquivo de retorno (codigo 2 na posicao 143).",
      );
    }
    if (field(header.text, 164, 166) !== "101") {
      issue(
        issues,
        header.lineNumber,
        "INVALID_FILE_LAYOUT",
        "Layout de arquivo diferente de 101.",
      );
    }
    const generationDate = parseCnabDateDDMMYYYY(field(header.text, 144, 151));
    if (!generationDate.valid || generationDate.empty) {
      issue(
        issues,
        header.lineNumber,
        "INVALID_GENERATION_DATE",
        "Data de geracao do header deve usar DDMMAAAA.",
      );
    }
  }

  const trailer = records[records.length - 1];
  if (trailer.recordType !== "9" || trailer.lote !== "9999") {
    issue(
      issues,
      trailer.lineNumber,
      "INVALID_FILE_TRAILER",
      "Ultimo registro deve ser o trailer de arquivo (lote 9999, tipo 9).",
    );
    return;
  }

  const declaredRecords = integerField(field(trailer.text, 24, 29));
  if (declaredRecords === null || declaredRecords !== records.length) {
    issue(
      issues,
      trailer.lineNumber,
      "FILE_RECORD_COUNT_MISMATCH",
      `Trailer informa ${declaredRecords ?? "valor invalido"} registros; ` +
        `arquivo contem ${records.length}.`,
    );
  }
};

const validateLots = (
  records: ValidatedCnab240Record[],
  issues: Cnab240ValidationIssue[],
) => {
  let openLot: {
    number: string;
    headerIndex: number;
    lastSequence: number;
  } | null = null;
  let lotCount = 0;

  for (let index = 1; index < records.length - 1; index += 1) {
    const record = records[index];
    if (record.recordType === "1") {
      if (openLot) {
        issue(
          issues,
          record.lineNumber,
          "UNCLOSED_LOT",
          `Lote ${openLot.number} nao possui trailer antes do proximo header.`,
        );
      }
      openLot = { number: record.lote, headerIndex: index, lastSequence: 0 };
      lotCount += 1;
      if (
        record.lote === "0000" || record.lote === "9999" || !digits(record.lote)
      ) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_LOT",
          "Numero de lote invalido.",
        );
      }
      if (field(record.text, 9, 9) !== "T") {
        issue(
          issues,
          record.lineNumber,
          "INVALID_RETURN_OPERATION",
          "Header de lote deve indicar operacao T (retorno).",
        );
      }
      if (field(record.text, 10, 11) !== "01") {
        issue(
          issues,
          record.lineNumber,
          "INVALID_SERVICE",
          "Header de lote deve indicar servico 01 (cobranca).",
        );
      }
      if (field(record.text, 14, 16) !== "060") {
        issue(
          issues,
          record.lineNumber,
          "INVALID_LOT_LAYOUT",
          "Layout de lote diferente de 060.",
        );
      }
      continue;
    }

    if (record.recordType === "3") {
      if (!openLot || openLot.number !== record.lote) {
        issue(
          issues,
          record.lineNumber,
          "DETAIL_OUTSIDE_LOT",
          "Registro detalhe fora do lote correspondente.",
        );
        continue;
      }
      const repeatsCurrentEntry = openLot.lastSequence > 0 &&
        record.sequence === openLot.lastSequence;
      const startsNextEntry = record.sequence === openLot.lastSequence + 1;
      if (
        record.sequence === null || (!repeatsCurrentEntry && !startsNextEntry)
      ) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_DETAIL_SEQUENCE",
          `Sequencial esperado ${
            openLot.lastSequence || 1
          } para os segmentos ` +
            `da entrada atual ou ${openLot.lastSequence + 1} para a proxima; ` +
            `recebido ${record.sequence ?? "invalido"}.`,
        );
      }
      if (startsNextEntry && record.sequence !== null) {
        openLot.lastSequence = record.sequence;
      }
      continue;
    }

    if (record.recordType === "5") {
      if (!openLot || openLot.number !== record.lote) {
        issue(
          issues,
          record.lineNumber,
          "TRAILER_WITHOUT_LOT",
          "Trailer nao corresponde a um lote aberto.",
        );
        continue;
      }
      const declared = integerField(field(record.text, 18, 23));
      const actual = index - openLot.headerIndex + 1;
      if (declared === null || declared !== actual) {
        issue(
          issues,
          record.lineNumber,
          "LOT_RECORD_COUNT_MISMATCH",
          `Trailer do lote informa ${
            declared ?? "valor invalido"
          } registros; ` +
            `lote contem ${actual}.`,
        );
      }
      openLot = null;
      continue;
    }

    issue(
      issues,
      record.lineNumber,
      "UNEXPECTED_RECORD_TYPE",
      `Tipo de registro ${
        record.recordType || "vazio"
      } inesperado no corpo do arquivo.`,
    );
  }

  if (openLot) {
    issue(
      issues,
      records[records.length - 1]?.lineNumber ?? 0,
      "UNCLOSED_LOT",
      `Lote ${openLot.number} nao possui trailer.`,
    );
  }

  const trailer = records[records.length - 1];
  if (trailer?.recordType === "9") {
    const declaredLots = integerField(field(trailer.text, 18, 23));
    if (declaredLots === null || declaredLots !== lotCount) {
      issue(
        issues,
        trailer.lineNumber,
        "FILE_LOT_COUNT_MISMATCH",
        `Trailer informa ${declaredLots ?? "valor invalido"} lotes; ` +
          `arquivo contem ${lotCount}.`,
      );
    }
  }
};

const validateReturnPairs = (
  records: ValidatedCnab240Record[],
  issues: Cnab240ValidationIssue[],
) => {
  const pairs: Cnab240ReturnPair[] = [];
  const pairedEntries = new Set<string>();
  const optionalYCount = new Map<string, number>();
  const key = (record: ValidatedCnab240Record) =>
    `${record.lote}:${record.sequence}`;

  for (const record of records) {
    if (record.recordType !== "3" || record.sequence === null) continue;

    if (!["T", "U", "Y"].includes(record.segment ?? "")) {
      issue(
        issues,
        record.lineNumber,
        "UNSUPPORTED_DETAIL_SEGMENT",
        `Segmento de retorno ${record.segment || "vazio"} nao suportado.`,
      );
    }

    if (record.segment === "Y" && field(record.text, 18, 19) !== "50") {
      issue(
        issues,
        record.lineNumber,
        "INVALID_OPTIONAL_RECORD",
        "Segmento Y de retorno deve usar o codigo opcional 50.",
      );
    }

    if (record.segment === "T") {
      const movement = field(record.text, 16, 17);
      const nossoNumero = field(record.text, 38, 57).trim();
      const nominalAmount = field(record.text, 82, 96);
      const reasons = parseCnabReasonCodes(field(record.text, 214, 223));
      if (!/^\d{2}$/.test(movement)) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_MOVEMENT",
          "Movimento do segmento T invalido.",
        );
      }
      if (!digits(nossoNumero) || /^0+$/.test(nossoNumero)) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_OUR_NUMBER",
          "Segmento T sem Nosso Numero numerico valido nas posicoes 38-57.",
        );
      }
      if (!digits(nominalAmount)) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_NOMINAL_AMOUNT",
          "Valor nominal do segmento T deve ser numerico.",
        );
      } else if (
        ["06", "17"].includes(movement) && /^0+$/.test(nominalAmount)
      ) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_NOMINAL_AMOUNT",
          "Liquidacao 06/17 deve possuir valor nominal maior que zero no segmento T.",
        );
      }
      if (reasons.invalidChunks.length) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_REASON_CODES",
          "Motivos da ocorrencia do segmento T possuem pares invalidos.",
        );
      }
    }

    if (record.segment === "U") {
      const movement = field(record.text, 16, 17);
      const paidAmount = field(record.text, 78, 92);
      const occurrenceDate = parseCnabDateDDMMYYYY(
        field(record.text, 138, 145),
      );
      if (!/^\d{2}$/.test(movement)) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_MOVEMENT",
          "Movimento do segmento U invalido.",
        );
      }
      if (!digits(paidAmount)) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_PAID_AMOUNT",
          "Valor pago do segmento U deve ser numerico.",
        );
      } else if (["06", "17"].includes(movement) && /^0+$/.test(paidAmount)) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_PAID_AMOUNT",
          "Liquidacao 06/17 deve possuir valor pago maior que zero.",
        );
      }
      if (
        !occurrenceDate.valid ||
        (["06", "17"].includes(movement) && occurrenceDate.empty)
      ) {
        issue(
          issues,
          record.lineNumber,
          "INVALID_OCCURRENCE_DATE",
          "Data da ocorrencia do segmento U deve usar DDMMAAAA.",
        );
      }
    }
  }

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.recordType !== "3" || record.sequence === null) continue;
    if (record.segment === "T") {
      const linkedU = records[index + 1];
      if (
        !linkedU || linkedU.recordType !== "3" || linkedU.segment !== "U" ||
        linkedU.lote !== record.lote
      ) {
        issue(
          issues,
          record.lineNumber,
          "MISSING_SEGMENT_U",
          "Segmento T nao possui segmento U adjacente no mesmo lote.",
        );
        continue;
      }
      if (linkedU.sequence !== record.sequence) {
        issue(
          issues,
          linkedU.lineNumber,
          "SEGMENT_SEQUENCE_MISMATCH",
          `Segmentos T e U da mesma entrada devem repetir o sequencial ` +
            `${record.sequence}; U informou ${linkedU.sequence ?? "invalido"}.`,
        );
        continue;
      }
      const movementT = field(record.text, 16, 17);
      const movementU = field(linkedU.text, 16, 17);
      if (movementT !== movementU) {
        issue(
          issues,
          linkedU.lineNumber,
          "MOVEMENT_MISMATCH",
          `Movimento do segmento T (${movementT}) difere do segmento U (${movementU}).`,
        );
        continue;
      }
      const entryKey = key(record);
      if (pairedEntries.has(entryKey)) {
        issue(
          issues,
          record.lineNumber,
          "DUPLICATE_TITLE_SEQUENCE",
          `Lote ${record.lote} repete a entrada sequencial ${record.sequence}.`,
        );
        continue;
      }
      pairedEntries.add(entryKey);
      pairs.push({ segmentT: record, segmentU: linkedU });
    } else if (record.segment === "U") {
      const linkedT = records[index - 1];
      if (
        !linkedT || linkedT.recordType !== "3" || linkedT.segment !== "T" ||
        linkedT.lote !== record.lote
      ) {
        issue(
          issues,
          record.lineNumber,
          "ORPHAN_SEGMENT_U",
          "Segmento U nao possui segmento T adjacente no mesmo lote.",
        );
      }
    } else if (record.segment === "Y") {
      const previous = records[index - 1];
      const followsSameEntry = previous?.recordType === "3" &&
        ["U", "Y"].includes(previous.segment ?? "") &&
        previous.lote === record.lote &&
        previous.sequence === record.sequence;
      if (!followsSameEntry) {
        issue(
          issues,
          record.lineNumber,
          "ORPHAN_SEGMENT_Y",
          "Segmento Y-50 deve suceder U/Y da mesma entrada e repetir o sequencial.",
        );
        continue;
      }
      const entryKey = key(record);
      const count = (optionalYCount.get(entryKey) ?? 0) + 1;
      optionalYCount.set(entryKey, count);
      if (count > 10) {
        issue(
          issues,
          record.lineNumber,
          "TOO_MANY_OPTIONAL_Y_SEGMENTS",
          "Uma entrada pode conter no maximo 10 segmentos Y-50.",
        );
      }
    }
  }

  return pairs;
};

export const validateBaneseCnab240Return = (
  payload: string | undefined | null,
): BaneseCnab240Validation => {
  const lines = splitCnab240Lines(String(payload ?? ""));
  const issues: Cnab240ValidationIssue[] = [];
  const records: ValidatedCnab240Record[] = [];

  for (const line of lines) {
    if (line.byteLength === null) {
      issue(
        issues,
        line.lineNumber,
        "NON_ANSI_RECORD",
        "Registro contem caractere fora de ANSI/Windows-1252.",
      );
      continue;
    }
    if (line.byteLength !== CNAB240_RECORD_LENGTH) {
      issue(
        issues,
        line.lineNumber,
        "INVALID_RECORD_LENGTH",
        `Registro possui ${line.byteLength} bytes; esperado 240.`,
      );
      continue;
    }
    if (field(line.text, 1, 3) !== "047") {
      issue(
        issues,
        line.lineNumber,
        "INVALID_BANK",
        "Registro nao pertence ao banco 047 (Banese).",
      );
    }
    const recordType = field(line.text, 8, 8);
    const sequenceRaw = recordType === "3" ? field(line.text, 9, 13) : "";
    records.push({
      ...line,
      lote: field(line.text, 4, 7),
      recordType,
      sequence: recordType === "3" ? integerField(sequenceRaw) : null,
      segment: recordType === "3"
        ? field(line.text, 14, 14).toUpperCase()
        : null,
    });
  }

  if (records.length !== lines.length) {
    return {
      valid: false,
      lineCount: lines.length,
      records,
      pairs: [],
      issues,
    };
  }

  validateFileEnvelope(records, issues);
  validateLots(records, issues);
  const pairs = validateReturnPairs(records, issues);
  if (!pairs.length) {
    issue(
      issues,
      0,
      "NO_RETURN_EVENTS",
      "Arquivo de retorno nao possui pares obrigatorios de segmentos T e U.",
    );
  }
  return {
    valid: issues.length === 0,
    lineCount: lines.length,
    records,
    pairs,
    issues,
  };
};
