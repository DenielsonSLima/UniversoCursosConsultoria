export const expenseQaId = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
export const EXPENSE_QA_REFERENCE = '2026-11-16T15:00:00Z';
export const EXPENSE_QA_POLO = expenseQaId(501);
export const expenseQaAccount = { id: expenseQaId(601), banco: 'CAIXA SINTÉTICA', natureza: 'CAIXA_INTERNO',
  conta: 'QA-001', agencia: '001', titular: 'Conta de teste', tipo: 'CORRENTE', saldoAtual: 1000,
  saldoInicial: 0, poloId: EXPENSE_QA_POLO, polosUso: [EXPENSE_QA_POLO], ativo: true };

const definitions = {
  A: { n: 1, descricao: 'A - Quitada antes do mês', valor: 100, data_vencimento: '2026-11-05',
    status: 'PAGO', valor_pago: 100, data_pagamento: '2026-10-29' },
  B: { n: 2, descricao: 'B - Venceu antes do mês', valor: 200, data_vencimento: '2026-10-20',
    status: 'PAGO', valor_pago: 200, data_pagamento: '2026-11-08' },
  C: { n: 3, descricao: 'C - Parcial vencida', valor: 300, data_vencimento: '2026-11-08',
    status: 'VENCIDO', valor_pago: 100, data_pagamento: '2026-11-09' },
  D: { n: 4, descricao: 'D - Aberta futura', valor: 400, data_vencimento: '2026-11-25', status: 'PENDENTE' },
  E: { n: 5, descricao: 'E - Estimada atrasada', valor: 500, data_vencimento: '2026-11-02',
    status: 'PENDENTE', valor_estimado: true, valor_estimado_original: 500 },
  F: { n: 6, descricao: 'F - Sem cobrança', valor: 600, data_vencimento: '2026-11-03', status: 'CANCELADO',
    valor_estimado: true, valor_estimado_original: 600, valor_sem_cobranca_em: '2026-11-16T03:00:00Z' },
  G: { n: 7, descricao: 'G - Cota estimada', valor: 90, data_vencimento: '2026-11-17', status: 'PENDENTE',
    valor_estimado: true, valor_estimado_original: 90, is_rateio_derivado: true,
    conta_bancaria_nome: 'CONTA FÍSICA SINTÉTICA DA MATRIZ' },
  H: { n: 8, descricao: 'H - Próximo mês', valor: 700, data_vencimento: '2026-12-10', status: 'PENDENTE' },
  I: { n: 9, descricao: 'I - Vencida anterior', valor: 80, data_vencimento: '2026-10-10', status: 'VENCIDO' },
  J: { n: 10, descricao: 'J - Pesquisa comercial', valor: 10, data_vencimento: '2026-11-30', status: 'PENDENTE',
    fornecedor_nome: 'RAZÃO SOCIAL SINTÉTICA', fornecedor_nome_fantasia: 'Fantasia Única QA' },
};

// Resultados explícitos do contrato: o stub não reutiliza predicados nem somas da implementação.
const cases = {
  'mes_atual:todas': { ids: ['E', 'F', 'A', 'C', 'G', 'D', 'J'], summary: [1400, 200, 1200, 610, 1, 590, 2] },
  'mes_atual:pagas': { ids: ['A'], summary: [100, 100, 0, 0, 0, 0, 0] },
  'mes_atual:em_aberto': { ids: ['E', 'C', 'G', 'D', 'J'], summary: [1300, 100, 1200, 610, 1, 590, 2] },
  'mes_atual:vencidas': { ids: ['C'], summary: [300, 100, 200, 200, 1, 0, 0] },
  'todos:todas': { ids: ['I', 'B', 'E', 'F', 'A', 'C', 'G', 'D', 'J', 'H'], summary: [2380, 400, 1980, 1390, 2, 590, 2] },
  'todos:pagas': { ids: ['B', 'A'], summary: [300, 300, 0, 0, 0, 0, 0] },
  'todos:em_aberto': { ids: ['I', 'E', 'C', 'G', 'D', 'J', 'H'], summary: [2080, 100, 1980, 1390, 2, 590, 2] },
  'todos:vencidas': { ids: ['I', 'C'], summary: [380, 100, 280, 280, 2, 0, 0] },
  fantasia: { ids: ['J'], summary: [10, 0, 10, 10, 0, 0, 0] },
};

const summaryFromTuple = ([total, paid, pending, confirmed, overdue, estimated, estimatedCount]) => ({
  total_value: total, paid_value: paid, pending_value: pending, confirmed_pending_value: confirmed,
  vencidos_count: overdue, estimated_value: estimated, estimated_count: estimatedCount,
});

export function expenseQaRow(key, tipo = 'DESPESA_FIXA', poloId = EXPENSE_QA_POLO) {
  const definition = definitions[key];
  const row = { id: expenseQaId((tipo === 'DESPESA_VARIAVEL' ? 100 : 0) + definition.n),
    polo_id: poloId, polo_nome: 'POLO SINTÉTICO', tipo, categoria_financeira_id: expenseQaId(701),
    categoria_nome: 'CATEGORIA SINTÉTICA', fornecedor_nome: 'FORNECEDOR SINTÉTICO',
    data_lancamento: '2026-11-01', parcela_numero: 1, total_parcelas: 1, juros_valor: 0, multa_valor: 0,
    desconto_valor: 0, valor_pago: null, created_at: '2026-11-01T10:00:00Z', ...definition };
  row.descricao = `${tipo === 'DESPESA_FIXA' ? 'FIXA' : 'VARIAVEL'} ${row.descricao}`;
  row.valor_base = row.valor;
  if (row.valor_sem_cobranca_em) row.valor = 0;
  if (row.valor_pago) {
    row.forma_pagamento = 'PIX'; row.conta_bancaria_id = expenseQaAccount.id;
    row.conta_bancaria_nome = 'CAIXA SINTÉTICA • QA-001'; row.pagamento_unico = row.status === 'PAGO';
    row.payment_summary = { originalAmount: row.valor.toFixed(2), previouslyPaid: row.valor_pago.toFixed(2),
      remainingBefore: (row.valor - row.valor_pago).toFixed(2), status: row.status, hasEvents: true };
  }
  return row;
}

export function expenseQaWorkspace(params) {
  const key = params.p_search ? 'fantasia'
    : params.p_status_scope === 'em_aberto' ? 'todos:em_aberto'
      : params.p_status_scope === 'vencidos' ? 'todos:vencidas'
        : `${params.p_status_scope}:${params.p_situacao}`;
  const fixture = cases[key];
  if (!fixture) throw new Error(`Cenário de QA não previsto: ${key}`);
  const ids = params.p_ordem === 'vencimento_desc' ? [...fixture.ids].reverse() : fixture.ids;
  const items = ids.map(id => expenseQaRow(id, params.p_tipo, params.p_polo_id));
  const summary = summaryFromTuple(fixture.summary);
  return { items, summary, groups: params.p_agrupamento === 'nenhum' ? [] : [{
    grupo_chave: expenseQaId(701), grupo_nome: 'CATEGORIA SINTÉTICA', categoria_id: expenseQaId(701),
    categoria_nome: 'CATEGORIA SINTÉTICA', total_value: summary.total_value, paid_value: summary.paid_value,
    pending_value: summary.pending_value, item_count: items.length,
    estimated_value: summary.estimated_value, estimated_count: summary.estimated_count,
  }] };
}

export function createExpenseQaClient() {
  const calls = [];
  const channels = new Set();
  const client = {
    calls, channels,
    auth: { getSession: async () => ({ data: { session: { user: { id: expenseQaId(901) } } } }) },
    rpc: async (name, params) => {
      calls.push({ name, params: globalThis.structuredClone(params) });
      if (name !== 'get_despesas_workspace_secure') throw new Error(`RPC não permitida no QA: ${name}`);
      return { data: expenseQaWorkspace(params), error: null };
    },
    from(table) {
      if (table !== 'categorias_financeiras') throw new Error(`Tabela não permitida no QA: ${table}`);
      const data = [{ id: expenseQaId(701), nome: 'CATEGORIA SINTÉTICA', tipo: 'DESPESA_FIXA', status: 'ativo' }];
      let chain;
      chain = new Proxy({}, { get: (_target, key) => key === 'then'
        ? (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject) : () => chain });
      return chain;
    },
    channel() {
      const entry = { active: true, callbacks: [], on(_kind, _filter, callback) { this.callbacks.push(callback); return this; },
        subscribe() { return this; } };
      channels.add(entry); return entry;
    },
    removeChannel(channel) { channel.active = false; channels.delete(channel); return Promise.resolve(); },
    emitChange() { for (const channel of channels) if (channel.active) channel.callbacks[0]?.(); },
  };
  return client;
}

export const expenseQaSharedQueries = { accountsQuery: { data: [expenseQaAccount], isSuccess: true },
  polosQuery: { data: [{ id: EXPENSE_QA_POLO, nome: 'POLO SINTÉTICO', is_matriz: true }], isSuccess: true },
  partnersQuery: { data: [], isSuccess: true }, turmasQuery: { data: [], isSuccess: true } };
