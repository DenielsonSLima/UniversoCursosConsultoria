import { renegotiationBillingSnapshotFromReceivable } from "./renegotiation-billing.ts";
import {
  buildBaneseTechnicalBillingInstructions,
  type BaneseAcademicBillingContext,
} from "./technical-billing-instructions.ts";

export const buildBaneseReceivableBillingInstructions = (input: {
  environment: "sandbox" | "production";
  documentKind: "boleto" | "carne";
  description?: unknown;
  academicContext?: BaneseAcademicBillingContext | null;
  receivable: unknown;
}) => {
  const snapshot = renegotiationBillingSnapshotFromReceivable(input.receivable);
  if (!snapshot) return buildBaneseTechnicalBillingInstructions(input);
  // O prazo congelado no acordo prevalece sobre texto mutável da turma.
  // Em outras modalidades, também compõe as instruções do novo título.
  const lines = buildBaneseTechnicalBillingInstructions({
    ...input,
    academicContext: input.academicContext
      ? { ...input.academicContext, instruction: snapshot.receiptPolicy.instruction }
      : null,
  });
  if (!lines.includes(snapshot.receiptPolicy.instruction)) lines.push(snapshot.receiptPolicy.instruction);
  return lines;
};
