import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { transferFinanceKeys, transferFinanceService } from '../../transfer-finance.service';
import { transferDate, transferFinancialLabels, transferMoney } from './TransferFinancialPreview';

export default function TransferFinancialHistory({ turmaId }: { turmaId: string }) {
  const query = useQuery({
    queryKey: transferFinanceKeys.history(turmaId), queryFn: () => transferFinanceService.history(turmaId),
    retry: false, staleTime: 15_000,
    refetchInterval: (state) => state.state.data?.some((entry) => entry.itens.some((item) => item.situacao === 'AGUARDANDO_BANESE')) ? 15_000 : false,
  });
  if (!query.isError && !query.isLoading && query.data?.length === 0) return null;
  return <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Financeiro das transferências">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-black uppercase text-[#001a33]">Financeiro das transferências</h3>
      <button type="button" onClick={() => { void query.refetch(); }} disabled={query.isFetching}
        className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 disabled:opacity-40">
        <RefreshCw size={13} className={query.isFetching ? 'animate-spin' : ''} /> Atualizar</button>
    </div>
    {query.isError ? <p className="mt-3 text-xs text-red-700">Não foi possível conferir as pendências financeiras das transferências. Atualize para tentar novamente.</p>
      : query.isLoading ? <p className="mt-3 text-xs text-slate-500">Consultando transferências...</p>
      : query.data?.map((entry) => <details key={entry.transferenciaId} className="mt-3 rounded-xl border border-slate-100 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-700">{entry.alunoNome} · {transferDate(entry.data)} · {entry.tipo === 'EXTERNA_ENVIADA' ? 'Saída externa' : 'Continuidade interna'}</summary>
        {entry.itens.length === 0 && <p className="mt-2 text-xs text-slate-500">Sem cobranças vinculadas.</p>}
        {entry.itens.map((item) => <div key={item.id} className="mt-2 border-t border-slate-100 pt-2 text-xs">
          <p className="font-semibold text-slate-700">{item.descricao} · {transferMoney(item.valor)}</p>
          <p className="mt-1 text-slate-500">{transferFinancialLabels[item.origem]} · {transferDate(item.vencimento)}{item.referencia ? ` · Ref. ${item.referencia}` : ''}</p>
          <p className="mt-1 font-semibold text-violet-800">{transferFinancialLabels[item.situacao]}</p>
        </div>)}
      </details>)}
  </section>;
}
