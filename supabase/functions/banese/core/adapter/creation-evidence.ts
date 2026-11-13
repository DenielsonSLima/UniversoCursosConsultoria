export type BaneseCreationEvidence = {
  request: Record<string, unknown>;
  creationResponse: Record<string, unknown>;
  pixPayload?: string | null;
  pixEncodedImage?: string | null;
};
// A private WeakMap keeps accepted POST evidence out of Error enumeration,
// JSON serialization, object spread and ordinary error logging.
const evidenceByError = new WeakMap<object, BaneseCreationEvidence>();
export const retainBaneseCreationEvidence = (error: unknown, evidence: BaneseCreationEvidence) => {
  if (error && typeof error === "object") evidenceByError.set(error, globalThis.structuredClone(evidence));
};
export const readBaneseCreationEvidence = (error: unknown): BaneseCreationEvidence | null => {
  const evidence = error && typeof error === "object" ? evidenceByError.get(error) : null;
  return evidence ? globalThis.structuredClone(evidence) : null;
};
