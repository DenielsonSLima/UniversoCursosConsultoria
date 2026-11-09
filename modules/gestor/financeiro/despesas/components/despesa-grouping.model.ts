import type { DespesaAgrupamento } from '../despesas.queryKeys';
import type { DespesaGroupSummary, DespesaLancamento } from '../despesas.types';

const monthLabel = (key: string) => new Intl.DateTimeFormat('pt-BR', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${key}-01T12:00:00Z`));

export function getDespesaGroupIdentity(item: DespesaLancamento, by: DespesaAgrupamento) {
  if (by === 'mes') {
    const match = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/.exec(item.dataVencimento || '');
    const key = match ? `${match[1]}-${match[2]}` : '__sem_vencimento__';
    return { key, label: match ? monthLabel(key) : 'Sem vencimento' };
  }
  if (by === 'fornecedor') return {
    key: item.fornecedorId || '__sem_fornecedor__',
    label: item.fornecedorId
      ? item.fornecedorNomeFantasia?.trim() || item.fornecedorNome?.trim() || 'Fornecedor não informado'
      : 'Fornecedor não informado',
  };
  return { key: item.categoriaFinanceiraId || '__sem_categoria__', label: item.categoriaNome || 'Sem categoria' };
}

export function buildDespesaGroups(
  items: DespesaLancamento[], summaries: DespesaGroupSummary[], by: DespesaAgrupamento,
) {
  const summaryMap = new Map(summaries.map((summary) => [
    summary.groupKey || summary.categoriaId || '__sem_categoria__', summary,
  ]));
  const groups = new Map<string, { key: string; label: string; items: DespesaLancamento[] }>();
  for (const item of items) {
    const identity = getDespesaGroupIdentity(item, by);
    if (!groups.has(identity.key)) groups.set(identity.key, { ...identity, items: [] });
    groups.get(identity.key)!.items.push(item);
  }
  return Array.from(groups.values()).map((group) => {
    const summary = summaryMap.get(group.key);
    const fantasia = by === 'fornecedor'
      ? group.items.find((item) => item.fornecedorNomeFantasia?.trim())?.fornecedorNomeFantasia?.trim()
      : undefined;
    return {
      ...group,
      label: fantasia || summary?.groupLabel || (by === 'categoria' ? summary?.categoriaNome : undefined) || group.label,
      // Valores e quantidade são os retornados pelo backend, sem refazer cálculos financeiros.
      total: summary?.totalValue,
      pago: summary?.paidValue,
      count: summary?.itemCount,
    };
  }).sort((a, b) => by === 'mes'
    ? a.key.localeCompare(b.key)
    : a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }) || a.key.localeCompare(b.key));
}
