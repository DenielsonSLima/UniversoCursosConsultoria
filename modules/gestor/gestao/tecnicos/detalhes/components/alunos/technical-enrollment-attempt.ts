export const resolveTechnicalEnrollmentAttempt = async (input: {
  requestIds: Map<string, string>;
  key: string;
  canEnroll: boolean;
  admissionMessage?: string | null;
  verifyAdmission?: () => Promise<void>;
  createRequestId: () => string;
}): Promise<string> => {
  const existing = input.requestIds.get(input.key);
  if (existing) return existing;
  if (!input.canEnroll) throw new Error(input.admissionMessage || 'A turma não permite nova matrícula direta.');
  await input.verifyAdmission?.();
  const requestId = input.requestIds.get(input.key) || input.createRequestId();
  input.requestIds.set(input.key, requestId);
  return requestId;
};
