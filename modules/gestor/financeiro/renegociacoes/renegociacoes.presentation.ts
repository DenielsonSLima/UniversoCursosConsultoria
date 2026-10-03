import type { RenegociacaoView } from './renegociacoes.types';

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : {};
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

export const formatCents = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
export const formatRenegociacaoDate = (value?: string | null) => {
  if (!value) return 'Não informado';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};
export const formatBasisPoints = (value: number) =>
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value / 100)}%`;
export const formatPolicyPercentage = (value: { basisPoints?: number; percent?: number }) => {
  const percent = value.percent;
  if (typeof percent === 'number' && Number.isFinite(percent)) {
    return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 }).format(percent)}%`;
  }
  return formatBasisPoints(value.basisPoints || 0);
};
export const formatCandidateAmount = (value: number | null) => (value == null ? 'Não calculado' : formatCents(value));
export const formatCandidateCharges = (interest: number | null, penalty: number | null) =>
  interest == null || penalty == null ? 'Não calculado' : formatCents(interest + penalty);
export const renegociacaoPolicyInheritedLabel = (origin: string) => {
  const normalized = origin
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (normalized.includes('MATRICULA') || normalized.includes('INDIVIDUAL')) return 'Herdado da matrícula';
  if (normalized.includes('TURMA')) return 'Herdado da turma';
  return `Herdado • ${origin}`;
};
export const parseCurrencyToCents = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};
export const formatCentsInput = (value: number) => (value / 100).toFixed(2).replace('.', ',');
export const viewLabel: Record<RenegociacaoView, string> = {
  A_NEGOCIAR: 'A negociar',
  EM_ANDAMENTO: 'Em andamento',
  EM_ATRASO: 'Em atraso',
  ENCERRADOS: 'Encerrados',
};
export const createRenegociacaoRequestId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues)
    throw new Error('Não foi possível gerar a identificação segura da solicitação.');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const isMissingRenegociacaoRpc = (error: unknown) => record(error).code === 'PGRST202';
export const renegociacaoErrorMessage = (error: unknown) => {
  const row = record(error);
  const code = text(row.code);
  const message = text(row.message);
  if (/RENEGOTIATION_CUSTOM_SCHEDULE_TOTAL_MISMATCH/.test(message))
    return 'A soma dos valores das parcelas deve ser igual ao saldo parcelado. Ajuste os valores e valide novamente.';
  if (/RENEGOTIATION_INVALID_CUSTOM_SCHEDULE/.test(message))
    return 'Revise o cronograma: valores positivos, todas as parcelas e vencimentos válidos em ordem crescente, a partir da data-base.';
  if (code === '57014' || /statement timeout/i.test(message))
    return 'A consulta excedeu o tempo permitido. Refine os filtros ou tente novamente.';
  if (code === 'PGRST202')
    return 'A consulta atualizada de renegociações ainda não está disponível. Tente novamente após a atualização.';
  if (code === '42501' || /RENEGOTIATION_FORBIDDEN/.test(message))
    return 'Seu usuário não possui autorização para esta operação.';
  if (code === '40001' || /RENEGOTIATION_(STALE|PREVIEW_STALE)/.test(message))
    return 'Os dados financeiros mudaram. Atualize a simulação antes de continuar.';
  if (code === '55000' || /RENEGOTIATION_RULES_NOT_READY/.test(message))
    return 'As regras de renegociação ainda não estão disponíveis.';
  if (code === '22023' || /RENEGOTIATION_INVALID_INPUT/.test(message))
    return 'Revise as parcelas e condições informadas.';
  if (/failed to fetch|networkerror|load failed/i.test(message))
    return 'Não foi possível comunicar com o servidor. Confira sua conexão e tente novamente.';
  return message || 'Não foi possível concluir a operação.';
};

export const renegociacaoUnavailableMessage = (reason?: string, fallback?: string) => {
  const messages: Record<string, string> = {
    RPC_NOT_APPLIED: 'Renegociações ainda não está disponível neste ambiente.',
    RENEGOTIATION_RULES_NOT_READY: 'As regras de renegociação ainda não estão disponíveis.',
    OPERATIONAL_ACTIVATION_NOT_IMPLEMENTED: 'A ativação ficará disponível após a integração bancária.',
  };
  return (reason && messages[reason]) || fallback || 'Esta função ainda não está disponível.';
};
