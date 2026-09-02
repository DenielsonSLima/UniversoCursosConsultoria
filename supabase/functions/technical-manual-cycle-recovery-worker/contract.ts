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
    expectedItemCount > 60
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
