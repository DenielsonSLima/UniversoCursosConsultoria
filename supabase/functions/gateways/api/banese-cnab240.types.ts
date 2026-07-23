export type Environment = "sandbox" | "production";

export type ImportResultType = "success" | "warning" | "error";

export type BaneseSettlementChannel = "BOLETO" | "PIX" | null;

export type ParsedEvent = {
  lineNumber: number;
  lote: string;
  nossoNumero: string;
  movementCode: string;
  nominalAmount: number;
  paidAmount: number;
  occurrenceDate: string | null;
  segmentTMovement: string | null;
  liquidationReasonCodes: string[];
  settlementChannel: BaneseSettlementChannel;
  paid: boolean;
  rawTLine: string | null;
  rawULine: string;
};

export type ParsedSegmentT = {
  linha: number;
  lote: string;
  sequence: number;
  movement: string | null;
  nossoNumero: string | null;
  nossoValido: boolean;
  nominalAmount: number;
  liquidationReasonCodes: string[];
  rawLine: string;
};

export type ImportOutcome = {
  row: number;
  nossoNumero: string;
  status: ImportResultType;
  action: string;
  message: string;
};

export type CnabParseSummary = {
  fileLines: number;
  segmentT: number;
  segmentU: number;
  events: number;
  matched: number;
  paid: number;
  notFound: number;
  conflicts: number;
  errors: number;
  skipped: number;
};

export type CnabParseResult = {
  summary: CnabParseSummary;
  events: ParsedEvent[];
  outcomes: ImportOutcome[];
};

export type ImportEventResult = {
  action: "not_found" | "conflict" | "paid" | "updated";
  status: ImportResultType;
  message: string;
  paymentApplied: boolean;
  transactionId?: string | null;
};

export type BaneseCnabImportResult = {
  success: boolean;
  importId: string;
  fileName: string | null;
  importedAt: string;
  summary: CnabParseSummary;
  outcomes: ImportOutcome[];
  message?: string;
};
