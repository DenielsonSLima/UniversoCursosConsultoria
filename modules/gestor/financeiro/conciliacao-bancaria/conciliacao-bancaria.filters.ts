export const BANESE_PENDING_STATUSES = [
  'PENDENTE',
  'VENCIDO',
  'AGUARDANDO_CONFIRMACAO',
  'AGUARDANDO_PAGAMENTO',
] as const;

export const BANESE_RECONCILIATION_STATUSES = [
  ...BANESE_PENDING_STATUSES,
  'PAGO',
] as const;

export interface ConciliacaoStatusFilterDefinition {
  operator: 'eq' | 'in';
  statuses: string[];
}

export const resolveConciliacaoStatusFilter = (
  status?: string,
): ConciliacaoStatusFilterDefinition => {
  const normalizedStatus = String(status || 'TODOS').trim().toUpperCase();

  if (normalizedStatus === 'TODOS') {
    return { operator: 'in', statuses: [...BANESE_RECONCILIATION_STATUSES] };
  }

  if (normalizedStatus === 'PENDENTE') {
    return {
      operator: 'in',
      statuses: ['PENDENTE', 'AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_PAGAMENTO'],
    };
  }

  return { operator: 'eq', statuses: [normalizedStatus] };
};
