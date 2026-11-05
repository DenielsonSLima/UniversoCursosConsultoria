export const formatCurrency = (value?: number | null) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const paymentMethodLabel = (value?: string | null) => {
  switch (value) {
    case 'PIX':
      return 'Pix';
    case 'BOLETO':
      return 'Boleto';
    case 'CREDIT_CARD':
    case 'CARTAO':
      return 'Cartão';
    default:
      return value || '-';
  }
};

export const statusStyle = (status?: string | null) => {
  switch (normalizeStatus(status)) {
    case 'PENDENTE':
    case 'AGUARDANDO_PAGAMENTO':
    case 'AGUARDANDO_CONFIRMACAO':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'ATIVO':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'CONCLUIDO':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'CANCELADO':
    case 'DESISTENTE':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-100';
  }
};

export const statusLabel = (status?: string | null) => {
  switch (normalizeStatus(status)) {
    case 'PENDENTE':
    case 'AGUARDANDO_PAGAMENTO':
    case 'AGUARDANDO_CONFIRMACAO':
      return 'Aguardando pagamento';
    case 'ATIVO':
      return 'Liberado';
    case 'CONCLUIDO':
      return 'Concluido';
    case 'TRANCADO':
      return 'Trancado';
    case 'CANCELADO':
      return 'Cancelado';
    case 'DESISTENTE':
      return 'Desistente';
    default:
      return status || 'Sem status';
  }
};

const EAD_ACTIVE_STATUSES = new Set(['ATIVO', 'CONCLUIDO']);
const EAD_PENDING_STATUSES = new Set(['PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO']);
export const normalizeStatus = (status?: string | null) =>
  String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
export const isEadEnrollmentActive = (status?: string | null) => EAD_ACTIVE_STATUSES.has(normalizeStatus(status));
export const isEadEnrollmentPending = (status?: string | null) => EAD_PENDING_STATUSES.has(normalizeStatus(status));

