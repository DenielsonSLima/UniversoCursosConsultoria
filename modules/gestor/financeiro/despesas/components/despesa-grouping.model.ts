import type { DespesaAgrupamento } from '../despesas.queryKeys';
import type { DespesaGroupSummary, DespesaLancamento } from '../despesas.types';

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
});

const monthLabel = (key: string) => {
  const label = monthFormatter.format(new Date(`${key}-01T12:00:00Z`));
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
};

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
  preserveSummaryOrder = false,
) {
  const positions = new Map(summaries.map((summary, index) => [
    summary.groupKey || summary.categoriaId || '__sem_categoria__', index,
  ]));
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
    const label = by === 'mes' ? group.label
      : fantasia || summary?.groupLabel || (by === 'categoria' ? summary?.categoriaNome : undefined) || group.label;
    return {
      ...group,
      label,
      // Valores e quantidade são os retornados pelo backend, sem refazer cálculos financeiros.
      total: summary?.totalValue,
      pago: summary?.paidValue,
      count: summary?.itemCount,
      estimatedValue: summary?.estimatedValue,
      estimatedCount: summary?.estimatedCount,
    };
  }).sort((a, b) => {
    if (preserveSummaryOrder) {
      const position = (positions.get(a.key) ?? Number.MAX_SAFE_INTEGER)
        - (positions.get(b.key) ?? Number.MAX_SAFE_INTEGER);
      if (position) return position;
    }
    return by === 'mes' ? a.key.localeCompare(b.key)
      : a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }) || a.key.localeCompare(b.key);
  });
}
