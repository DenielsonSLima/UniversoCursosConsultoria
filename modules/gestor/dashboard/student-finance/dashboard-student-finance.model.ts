import type { ContasReceber } from '../../financeiro/financeiro.service';

export interface DashboardStudentReceivable extends ContasReceber {
  id: string;
  clienteCpf: string;
  hasRemoteCharge: boolean;
}

export const DASHBOARD_EXISTING_TITLE_SETTLEMENT_CONTEXT =
  'DASHBOARD_EXISTING_TITLE_ONLY' as const;

export interface DashboardStudentFinanceAccess {
  canSearch: boolean;
  canSettle: boolean;
}

export const resolveDashboardStudentFinanceAccess = (
  canUseFinance: boolean,
  canReadSummary: boolean,
  canReceive: boolean,
): DashboardStudentFinanceAccess => ({
  canSearch: canUseFinance && (canReadSummary || canReceive),
  canSettle: canUseFinance && canReceive,
});

export type DashboardSettlementBlock =
  | 'permission'
  | 'enrollment'
  | 'launch-type'
  | 'select-polo'
  | 'polo-scope';

type SearchRow = Record<string, unknown>;

const optionalString = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized || undefined;
};

const requiredString = (value: unknown) => String(value || '').trim();

const normalizeStatus = (value: unknown): ContasReceber['status'] | null => {
  const status = requiredString(value).toUpperCase();
  if (status === 'PENDENTE' || status === 'VENCIDO') return status;
  return null;
};

const normalizeLaunchType = (value: unknown): ContasReceber['tipoLancamento'] => {
  const type = requiredString(value).toUpperCase();
  if (
    type === 'MATRICULA'
    || type === 'PARCELA'
    || type === 'REMATRICULA'
    || type === 'DEPENDENCIA'
  ) return type;
  return undefined;
};

export const mapDashboardStudentReceivable = (
  row: SearchRow,
): DashboardStudentReceivable | null => {
  const id = requiredString(row.id);
  const poloId = requiredString(row.polo_id);
  const value = Number(row.valor);
  const status = normalizeStatus(row.status);
  if (!id || !poloId || !Number.isFinite(value) || value <= 0 || !status) return null;

  const clienteCpf = requiredString(row.cliente_cpf);
  const explicitGatewayProvider = optionalString(row.gateway_provider);
  const hasRemoteCharge = row.has_remote_charge === true || Boolean(explicitGatewayProvider);

  return {
    id,
    poloId,
    poloNome: optionalString(row.polo_nome),
    descricao: requiredString(row.descricao),
    valor: value,
    dataVencimento: requiredString(row.data_vencimento),
    dataPagamento: optionalString(row.data_pagamento),
    status,
    categoria: 'MENSALIDADE',
    clienteId: optionalString(row.cliente_id),
    clienteNome: optionalString(row.cliente_nome) || 'Cliente Geral',
    clienteCpf,
    clienteCpfCnpj: clienteCpf,
    matriculaId: optionalString(row.matricula_id),
    turmaId: optionalString(row.turma_id),
    formaPagamento: optionalString(row.forma_pagamento) as ContasReceber['formaPagamento'],
    tipoLancamento: normalizeLaunchType(row.tipo_lancamento),
    gatewayProvider: explicitGatewayProvider || (hasRemoteCharge ? 'integracao_bancaria' : undefined),
    hasRemoteCharge,
  };
};

export const getDashboardSettlementBlock = (
  receivable: DashboardStudentReceivable,
  canSettle: boolean,
  activePoloId?: string | null,
): DashboardSettlementBlock | null => {
  if (!canSettle) return 'permission';
  if (receivable.tipoLancamento === 'MATRICULA') return 'enrollment';
  if (!receivable.tipoLancamento) return 'launch-type';
  if (!activePoloId || activePoloId === 'todos') return 'select-polo';
  if (!receivable.poloId || receivable.poloId !== activePoloId) return 'polo-scope';
  return null;
};

export const dashboardSettlementGuidance = (
  block: DashboardSettlementBlock,
) => {
  if (block === 'enrollment') {
    return 'Baixa de matrícula deve ser realizada no módulo Financeiro, pois pode gerar parcelas futuras.';
  }
  if (block === 'select-polo') {
    return 'Selecione um polo específico no topo da tela para registrar a baixa.';
  }
  if (block === 'polo-scope') {
    return 'Este lançamento não pertence ao polo ativo. Atualize o polo antes de registrar a baixa.';
  }
  if (block === 'launch-type') {
    return 'Tipo de lançamento não identificado. Realize a conferência e a baixa no módulo Financeiro.';
  }
  return 'Seu perfil pode consultar, mas não possui a permissão Financeiro / Receber.';
};
