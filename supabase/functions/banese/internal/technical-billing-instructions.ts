import { DEPENDENCY_BILLING_INSTRUCTION } from "./dependency-billing.ts";

export const DEFAULT_TECHNICAL_BILLING_INSTRUCTION =
  DEPENDENCY_BILLING_INSTRUCTION;

export type BaneseAcademicBillingContext = {
  modality: string;
  classCode: string;
  className: string;
  instruction: string;
};

type TechnicalBillingInstructionInput = {
  environment: "sandbox" | "production";
  documentKind: "boleto" | "carne";
  description?: unknown;
  academicContext?: BaneseAcademicBillingContext | null;
};

const singleLine = (value: unknown, maxLength: number) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

export const buildBaneseTechnicalBillingInstructions = (
  input: TechnicalBillingInstructionInput,
) => {
  const instructions: string[] = [];
  if (input.environment === "sandbox") {
    instructions.push(
      `${input.documentKind === "carne" ? "CARNÊ" : "BOLETO"} DE HOMOLOGAÇÃO - NÃO REALIZAR PAGAMENTO.`,
    );
  }

  const description = singleLine(input.description, 120);
  if (description) instructions.push(description);

  const context = input.academicContext;
  if (singleLine(context?.modality, 30).toUpperCase() !== "TECNICO") {
    return instructions;
  }

  const classIdentification = [
    singleLine(context?.classCode, 40),
    singleLine(context?.className, 90),
  ].filter(Boolean).join(" — ");
  if (classIdentification) {
    instructions.push(`TURMA: ${classIdentification}`);
  }

  const instruction = singleLine(
    context?.instruction || DEFAULT_TECHNICAL_BILLING_INSTRUCTION,
    180,
  );
  if (instruction) instructions.push(instruction);
  return instructions;
};

/** A disciplina refeita não expõe a turma de reoferta nem o motivo acadêmico. */
export const buildBaneseDependencyBillingInstructions = (
  input: Pick<TechnicalBillingInstructionInput, "environment" | "documentKind" | "description">,
) => {
  const instructions: string[] = [];
  if (input.environment === "sandbox") {
    instructions.push(
      `${input.documentKind === "carne" ? "CARNÊ" : "BOLETO"} DE HOMOLOGAÇÃO - NÃO REALIZAR PAGAMENTO.`,
    );
  }

  const description = singleLine(input.description, 120);
  if (description) instructions.push(description);
  instructions.push(DEPENDENCY_BILLING_INSTRUCTION);
  return instructions;
};
