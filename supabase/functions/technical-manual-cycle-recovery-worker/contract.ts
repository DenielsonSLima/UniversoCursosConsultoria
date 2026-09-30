import {
  DATABASE_UUID_RE,
  REQUEST_UUID_RE,
} from "../technical-manual-cycle-issuance/contract.ts";

export type InternalCycleRecoveryRequest = {
  matriculaId: string;
  cicloNumero: number;
  expectedCycleRequestId: string;
  expectedItemCount: number;
};

export const KNOWN_DUE_DATE_CORRECTION = Object.freeze(
  {
    action: "correct_known_technical_title_due_date",
    receivableId: "22c59dbe-0d77-4c2f-8842-4327b1c17147",
    matriculaId: "42998678-954a-400e-b8d6-780d99c8586d",
    turmaId: "78fd9e65-de3a-4e00-8a99-6fe8804e1d42",
    cicloNumero: 1,
    expectedCycleRequestId: "4c47d993-aa6e-403e-8569-e89ce543fa5a",
    expectedItemCount: 12,
    correctionRequestId: "58ff2178-27f4-4994-9013-697fd935fd9f",
    expectedAuthorizationRequestId: "35190871-1521-5acc-b39d-d22759309b75",
    expectedItemKey: "ciclo-1-parc-12",
    expectedDueDate: "2027-10-15",
    correctedDueDate: "2026-10-15",
  } as const,
);

export type KnownDueDateCorrectionRequest = {
  action: typeof KNOWN_DUE_DATE_CORRECTION.action;
  receivableId: string;
  matriculaId: string;
  turmaId: string;
  cicloNumero: number;
  expectedCycleRequestId: string;
  expectedItemCount: number;
  correctionRequestId: string;
  expectedAuthorizationRequestId: string;
  expectedItemKey: string;
  expectedDueDate: string;
  correctedDueDate: string;
};

export type InternalCycleWorkerRequest =
  | (
    & { action: "resume_existing_technical_cycle" }
    & InternalCycleRecoveryRequest
  )
  | KnownDueDateCorrectionRequest;

export class InternalCycleRecoveryRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalCycleRecoveryRequestError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const requiredUuid = (value: unknown, pattern: RegExp, field: string) => {
  const candidate = String(value ?? "").trim();
  if (!pattern.test(candidate)) {
    throw new InternalCycleRecoveryRequestError(`${field} inválido.`);
  }
  return candidate;
};

export const parseInternalCycleRecoveryRequest = (
  value: unknown,
): InternalCycleRecoveryRequest => {
  const body = asRecord(value);
  if (!body || body.action !== "resume_existing_technical_cycle") {
    throw new InternalCycleRecoveryRequestError("Ação interna inválida.");
  }
  const cicloNumero = Number(body.cicloNumero);
  const expectedItemCount = Number(body.expectedItemCount);
  if (!Number.isInteger(cicloNumero) || cicloNumero < 1 || cicloNumero > 2) {
    throw new InternalCycleRecoveryRequestError("Ciclo inválido.");
  }
  if (
    !Number.isInteger(expectedItemCount) || expectedItemCount < 1 ||
    expectedItemCount > 61
  ) {
    throw new InternalCycleRecoveryRequestError(
      "Quantidade esperada de itens inválida.",
    );
  }
  return {
    matriculaId: requiredUuid(
      body.matriculaId,
      DATABASE_UUID_RE,
      "Matrícula",
    ),
    cicloNumero,
    expectedCycleRequestId: requiredUuid(
      body.expectedCycleRequestId,
      REQUEST_UUID_RE,
      "Requisição original",
    ),
    expectedItemCount,
  };
};

const exactKnownCorrectionField = <
  K extends keyof KnownDueDateCorrectionRequest,
>(
  body: Record<string, unknown>,
  field: K,
) => {
  const expected = KNOWN_DUE_DATE_CORRECTION[field];
  if (body[field] !== expected) {
    throw new InternalCycleRecoveryRequestError(
      `Escopo one-off divergente em ${String(field)}.`,
    );
  }
  return expected;
};

export const parseKnownDueDateCorrectionRequest = (
  value: unknown,
): KnownDueDateCorrectionRequest => {
  const body = asRecord(value);
  if (!body || body.action !== KNOWN_DUE_DATE_CORRECTION.action) {
    throw new InternalCycleRecoveryRequestError("Ação corretiva inválida.");
  }
  return {
    action: exactKnownCorrectionField(body, "action"),
    receivableId: exactKnownCorrectionField(body, "receivableId"),
    matriculaId: exactKnownCorrectionField(body, "matriculaId"),
    turmaId: exactKnownCorrectionField(body, "turmaId"),
    cicloNumero: exactKnownCorrectionField(body, "cicloNumero"),
    expectedCycleRequestId: exactKnownCorrectionField(
      body,
      "expectedCycleRequestId",
    ),
    expectedItemCount: exactKnownCorrectionField(body, "expectedItemCount"),
    correctionRequestId: exactKnownCorrectionField(
      body,
      "correctionRequestId",
    ),
    expectedAuthorizationRequestId: exactKnownCorrectionField(
      body,
      "expectedAuthorizationRequestId",
    ),
    expectedItemKey: exactKnownCorrectionField(body, "expectedItemKey"),
    expectedDueDate: exactKnownCorrectionField(body, "expectedDueDate"),
    correctedDueDate: exactKnownCorrectionField(body, "correctedDueDate"),
  };
};

export const parseInternalCycleWorkerRequest = (
  value: unknown,
): InternalCycleWorkerRequest => {
  const body = asRecord(value);
  if (body?.action === KNOWN_DUE_DATE_CORRECTION.action) {
    return parseKnownDueDateCorrectionRequest(body);
  }
  return {
    action: "resume_existing_technical_cycle",
    ...parseInternalCycleRecoveryRequest(body),
  };
};
