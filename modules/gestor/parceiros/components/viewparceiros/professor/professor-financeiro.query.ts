import type { FinanceiroTabId } from '../../../../access-control';

export type ProfessorFinanceSource = 'despesas' | 'outros-debitos' | 'historico' | 'mensalidades' | 'servicos' | 'outros-creditos';
export type ProfessorFinanceStatus = 'todos' | 'abertos' | 'pagos' | 'cancelados';

export const professorFinanceSources = [
  { id: 'despesas', label: 'Despesas a pagar', permission: 'despesas', table: 'despesas_lancamentos' },
  { id: 'outros-debitos', label: 'Outros débitos a pagar', permission: 'outros-debitos', table: 'despesas_lancamentos' },
  { id: 'historico', label: 'Contas a pagar anteriores', permission: 'despesas', table: 'contas_pagar' },
  { id: 'mensalidades', label: 'Cursos a receber', permission: 'receber', table: 'contas_receber' },
  { id: 'servicos', label: 'Serviços a receber', permission: 'receber', table: 'contas_receber' },
  { id: 'outros-creditos', label: 'Outros créditos a receber', permission: 'outros-creditos', table: 'contas_receber' },
] as const;

export interface ProfessorFinanceFilters {
  professorId: string;
  poloId: string;
  source: ProfessorFinanceSource;
  status: ProfessorFinanceStatus;
  page: number;
  pageSize: number;
}

export interface ProfessorFinanceItem {
  id: string;
  description: string;
  value: number | null;
  paidValue: number | null;
  status: string;
  dueDate: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  category: string | null;
  baseValue: number | null;
  interest: number | null;
  fine: number | null;
  discount: number | null;
  note: string | null;
  installment: number | null;
  installments: number | null;
}

export interface ProfessorFinancePage {
  items: ProfessorFinanceItem[];
  totalItems: number;
}

const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const numeric = (value: unknown): number | null => value === null || value === undefined || value === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const text = (value: unknown): string | null => typeof value === 'string' && value ? value : null;

// The RPC authorizes each source, partner and unit before reading financial data.
export async function queryProfessorFinance(
  client: { rpc: (name: string, args: Record<string, unknown>) => any },
  filters: ProfessorFinanceFilters,
  allowedTabs: readonly FinanceiroTabId[],
  signal?: AbortSignal,
): Promise<ProfessorFinancePage> {
  const source = professorFinanceSources.find(item => item.id === filters.source);
  if (!source || !allowedTabs.includes(source.permission)) throw new Error('Acesso financeiro não autorizado.');
  if (!uuidPattern.test(filters.professorId) || !uuidPattern.test(filters.poloId)) {
    throw new Error('Selecione uma unidade válida para consultar o financeiro.');
  }
  if (!Number.isInteger(filters.page) || filters.page < 1 || filters.page > 10000
    || !Number.isInteger(filters.pageSize) || filters.pageSize < 1 || filters.pageSize > 25
    || !['todos', 'abertos', 'pagos', 'cancelados'].includes(filters.status)) {
    throw new Error('Filtros financeiros inválidos.');
  }

  let query = client.rpc('parceiro_professor_financeiro_visualizacao', {
    p_professor_id: filters.professorId, p_polo_id: filters.poloId, p_source: source.id,
    p_status: filters.status, p_page: filters.page, p_page_size: filters.pageSize,
  });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.totalItems) || data.totalItems < 0
    || data.professorId !== filters.professorId || data.poloId !== filters.poloId || data.source !== source.id
    || data.page !== filters.page || data.pageSize !== filters.pageSize || data.items.length > filters.pageSize
    || data.items.length > data.totalItems) throw new Error('Resposta financeira inválida.');
  if (data.items.some((row: any) => row.partner_id !== filters.professorId || row.polo_id !== filters.poloId)) {
    throw new Error('A consulta retornou outro parceiro ou unidade. Reabra o perfil antes de continuar.');
  }
  return {
    totalItems: data.totalItems,
    items: data.items.map((row: any) => ({
      id: String(row.id), description: row.descricao || 'Lançamento sem descrição',
      value: numeric(row.valor), paidValue: numeric(row.valor_pago), status: row.status || 'Não informado',
      dueDate: text(row.data_vencimento), paymentDate: text(row.data_pagamento), paymentMethod: text(row.forma_pagamento),
      category: text(row.tipo || row.categoria), baseValue: numeric(row.valor_base), interest: numeric(row.juros_valor),
      fine: numeric(row.multa_valor), discount: numeric(row.desconto_valor), note: text(row.observacao),
      installment: numeric(row.parcela_numero), installments: numeric(row.total_parcelas),
    })),
  };
}
