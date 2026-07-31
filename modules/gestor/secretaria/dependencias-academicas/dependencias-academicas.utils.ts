import type {
  DependenciaAcademica,
  DependenciaStatus,
  DependenciaWorkspaceTab,
} from './dependencias-academicas.types';

const PENDING_STATUSES = new Set([
  'PENDENTE_ENCAMINHAMENTO',
  'AGUARDANDO_OFERTA',
  'AGUARDANDO_PAGAMENTO',
  'PAGAMENTO_PROCESSANDO',
]);

const ACTIVE_STATUSES = new Set([
  'PROGRAMADA',
  'EM_CURSO',
  'AGUARDANDO_RESULTADO',
]);

export const CLOSED_STATUSES = new Set([
  'CONCLUIDA_APROVADA',
  'CONCLUIDA_REPROVADA',
  'CANCELADA',
  'DISPENSADA',
  'ENCERRADA',
]);

export const normalizeStatus = (status?: string | null) =>
  String(status || 'PENDENTE_ENCAMINHAMENTO').trim().toUpperCase();

export const statusTab = (status: DependenciaStatus): DependenciaWorkspaceTab => {
  const normalized = normalizeStatus(status);
  if (ACTIVE_STATUSES.has(normalized)) return 'programadas';
  if (CLOSED_STATUSES.has(normalized)) return 'encerradas';
  return PENDING_STATUSES.has(normalized) ? 'pendentes' : 'pendentes';
};

export const filterByTab = (
  items: DependenciaAcademica[],
  tab: DependenciaWorkspaceTab,
) => tab === 'regras'
  ? []
  : items.filter((item) => statusTab(item.status) === tab);

export const formatCurrency = (value?: number | null) =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);

export const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

export const formatGrade = (value?: number | null) =>
  value === null || value === undefined
    ? '—'
    : value.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      });

export const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const matchesDependenciaSearch = (
  item: DependenciaAcademica,
  search: string,
) => {
  const term = normalizeSearch(search);
  if (!term) return true;
  return normalizeSearch([
    item.alunoNome,
    item.alunoCpf,
    item.cursoNome,
    item.turmaOrigemNome,
    item.turmaOrigemCodigo,
    item.disciplinaNome,
    item.turmaDestinoNome,
    item.turmaDestinoCodigo,
    item.status,
  ].filter(Boolean).join(' ')).includes(term);
};

export const todayInputValue = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
