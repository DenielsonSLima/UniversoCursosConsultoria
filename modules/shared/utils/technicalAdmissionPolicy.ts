export interface TechnicalAdmissionPolicy {
  versao: 1;
  turmaId: string;
  dataReferencia: string;
  dataInicio: string | null;
  dataLimiteMatriculaDireta: string | null;
  diasDesdeInicio: number | null;
  matriculaDiretaPermitida: boolean;
  transferenciaObrigatoria: boolean;
  motivo: 'PERMITIDA' | 'PRAZO_EXPIRADO' | 'DATA_INICIO_AUSENTE' | 'TURMA_INDISPONIVEL';
  mensagem: string;
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);
const isoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const nullableDate = (value: unknown) => value === null || isoDate(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const requireTechnicalAdmissionPolicy = (
  value: unknown,
  expectedTurmaId?: string,
): TechnicalAdmissionPolicy => {
  if (!record(value) || value.versao !== 1 || typeof value.turmaId !== 'string'
    || !uuid.test(value.turmaId) || (expectedTurmaId && value.turmaId !== expectedTurmaId)
    || !isoDate(value.dataReferencia) || !nullableDate(value.dataInicio)
    || !nullableDate(value.dataLimiteMatriculaDireta)
    || !(value.diasDesdeInicio === null || Number.isInteger(value.diasDesdeInicio))
    || typeof value.matriculaDiretaPermitida !== 'boolean'
    || typeof value.transferenciaObrigatoria !== 'boolean'
    || !['PERMITIDA', 'PRAZO_EXPIRADO', 'DATA_INICIO_AUSENTE', 'TURMA_INDISPONIVEL'].includes(String(value.motivo))
    || typeof value.mensagem !== 'string' || !value.mensagem.trim()
    || value.matriculaDiretaPermitida !== (value.motivo === 'PERMITIDA')
    || value.transferenciaObrigatoria !== (value.motivo === 'PRAZO_EXPIRADO')
    || (value.dataInicio === null) !== (value.dataLimiteMatriculaDireta === null)
    || (value.dataInicio === null) !== (value.diasDesdeInicio === null)
    || (value.motivo === 'DATA_INICIO_AUSENTE' && value.dataInicio !== null)
    || (['PERMITIDA', 'PRAZO_EXPIRADO'].includes(String(value.motivo)) && value.dataInicio === null)) {
    throw new Error('O servidor não confirmou a política de ingresso desta turma.');
  }
  return value as unknown as TechnicalAdmissionPolicy;
};

export interface TechnicalAdmissionUiState {
  allowed: boolean;
  message: string | null;
  transferRequired: boolean;
  retryable: boolean;
}

export const technicalAdmissionUiState = (input: {
  required: boolean;
  phaseAllowed: boolean;
  policy?: TechnicalAdmissionPolicy;
  pending: boolean;
  fetching: boolean;
  error: boolean;
}): TechnicalAdmissionUiState => {
  if (!input.phaseAllowed) return { allowed: false, message: 'A fase atual da turma não permite novas matrículas.', transferRequired: false, retryable: false };
  if (!input.required) return { allowed: true, message: null, transferRequired: false, retryable: false };
  if (input.error) return { allowed: false, message: 'Não foi possível conferir a política de ingresso. Tente novamente antes de matricular.', transferRequired: false, retryable: true };
  if (input.pending || input.fetching) return { allowed: false, message: 'Conferindo o prazo para matrícula direta...', transferRequired: false, retryable: false };
  if (!input.policy) return { allowed: false, message: 'A política de ingresso não foi confirmada. Tente novamente antes de matricular.', transferRequired: false, retryable: true };
  return {
    allowed: input.policy.matriculaDiretaPermitida,
    message: input.policy.matriculaDiretaPermitida
      ? `Matrícula direta até ${input.policy.dataLimiteMatriculaDireta!.split('-').reverse().join('/')}.`
      : input.policy.mensagem,
    transferRequired: input.policy.transferenciaObrigatoria,
    retryable: false,
  };
};
