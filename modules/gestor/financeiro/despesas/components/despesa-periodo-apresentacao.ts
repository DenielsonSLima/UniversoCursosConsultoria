import type { DespesaOrdem, DespesaSituacao, DespesaStatusScope } from '../despesas.queryKeys';

export const despesaScopeLabels: Record<DespesaStatusScope, string> = {
  mes_atual: 'Mês atual', em_aberto: 'Em aberto', vencidos: 'Vencidos', todos: 'Todos',
};

export const despesaSituacaoLabels: Record<DespesaSituacao, string> = {
  todas: 'Todas', pagas: 'Pagas', em_aberto: 'Em aberto', vencidas: 'Vencidas',
};

export const despesaOrdemLabels: Record<DespesaOrdem, string> = {
  vencimento_asc: 'Menor data primeiro', vencimento_desc: 'Maior data primeiro',
};

export const getDespesaSituacaoEfetiva = (scope: DespesaStatusScope, selected: DespesaSituacao): DespesaSituacao => (
  scope === 'em_aberto' ? 'em_aberto' : scope === 'vencidos' ? 'vencidas' : selected
);

export const formatDespesaFilterDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

export function getDespesaPeriodoLabel(
  scope: DespesaStatusScope, start = '', end = '', reference = new Date(),
) {
  const period = start || end
    ? `${start ? formatDespesaFilterDate(start) : 'Sem limite inicial'} até ${end ? formatDespesaFilterDate(end) : 'sem limite final'}`
    : 'Todos os períodos';
  if (scope !== 'mes_atual') return period;
  const month = new Intl.DateTimeFormat('pt-BR', {
    month: 'long', year: 'numeric', timeZone: 'America/Maceio',
  }).format(reference);
  return `Vencimentos de ${month}${start || end ? ` · Intervalo informado: ${period}` : ''}`;
}
