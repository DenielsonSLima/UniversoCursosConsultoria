import React from 'react';
import { ChevronDown, ChevronRight, Loader2, Users } from 'lucide-react';
import { ReceivablesQueryRecovery } from '../components/modalidade-receber/ReceivablesQueryRecovery';
import { formatNextPendingDueDate } from '../components/modalidade-receber/modalidade-receber.utils';
import { ServiceReceivableCard, ServiceReceivableRow, type ServiceReceivableActions } from './ServiceReceivableRow';
import type { useServicosReceber } from './useServicosReceber';

function PageControls({ page, pages, loading, onChange, label }: {
  page: number; pages: number; loading: boolean; onChange: (page: number) => void; label: string;
}) {
  return <div className="flex items-center justify-end gap-2 text-[10px] font-black uppercase text-slate-500">
    <button type="button" aria-label={`Página anterior ${label}`} disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}
      className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-40">Anterior</button>
    <span className="rounded-xl bg-slate-50 px-3 py-2 font-black text-[#001a33]">{page} / {pages}</span>
    <button type="button" aria-label={`Próxima página ${label}`} disabled={page >= pages || loading} onClick={() => onChange(page + 1)}
      className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-40">Próxima</button>
  </div>;
}

export function ServiceReceivablesList({ model: m, ...actions }: { model: ReturnType<typeof useServicosReceber> } & ServiceReceivableActions) {
  const data = m.list.isError || m.periodError ? undefined : m.list.data;
  const groups = data?.groups || [], totalItems = data?.totalItems || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / m.pageSize));
  const pagination = (key: string, count: number) => {
    const pages = Math.max(1, Math.ceil(count / m.groupItemsPageSize));
    return pages > 1 ? <PageControls page={m.groupPages[key] || 1} pages={pages} loading={m.groupItemsByKey.get(key)?.isFetching || false}
      onChange={page => m.changeGroupPage(key, page)} label="das parcelas do parceiro" /> : null;
  };
  const queryRecovery = (key: string) => {
    const state = m.groupItemsByKey.get(key);
    return state?.isError || state?.isPaused ? <ReceivablesQueryRecovery offline={state.isPaused}
      retrying={state.isFetching} onRetry={state.onRetry} /> : null;
  };
  return <>
    <div className="financial-data-surface relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white">
      {m.list.isFetching && !m.list.isPending ? <div role="status" className="absolute right-5 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-700 shadow-sm"><Loader2 className="animate-spin" size={12} />Atualizando</div> : null}
      {m.list.isPending && !m.periodError ? <div role="status" className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-500">
        <Loader2 className="animate-spin text-emerald-600" />Carregando recebíveis...</div> : m.viewMode === 'cards' ? (
        <div className="space-y-5 bg-slate-50/60 p-4">
          {!totalItems ? <p className="py-16 text-center text-xs font-bold text-slate-400">Nenhuma cobrança encontrada.</p> : null}
          {groups.map(group => {
            const expanded = m.expandedGroups.has(group.key), state = m.groupItemsByKey.get(group.key);
            return <section key={group.key} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4">
              <button type="button" onClick={() => m.toggleGroup(group.key)} aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-4 text-left">
                <span className="flex min-w-0 items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600">
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Users size={14} /><span className="truncate">{group.label}</span></span>
                <span className="whitespace-nowrap text-[10px] font-bold text-slate-400">{group.itemCount} cobrança(s)</span>
              </button>
              {expanded ? <>{queryRecovery(group.key)}
                {state?.isLoading ? <p role="status" className="py-8 text-center text-xs font-bold text-slate-400">Carregando parcelas...</p>
                  : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{state?.rows.map(item => <ServiceReceivableCard key={item.id} item={item} {...actions} />)}</div>}
                {pagination(group.key, group.itemCount)}</> : null}
            </section>;
          })}
        </div>
      ) : <div className="overflow-x-auto"><table className="financial-data-table financial-receivables-table w-full min-w-[1080px] table-fixed text-left">
        <colgroup><col className="w-[18%]" /><col className="w-[23%]" /><col className="w-[17%]" /><col className="w-[11%]" /><col className="w-[17%]" /><col className="w-[14%]" /></colgroup>
        <thead className="bg-slate-50"><tr>{['Parceiro / parcela', 'Serviço / NFS-e', 'Recebimento', 'Datas', 'Valor', 'Ações'].map((label, index) =>
          <th key={label} className={`${index >= 4 ? 'pl-3 pr-2' : 'px-5'} py-4 text-[10px] font-black uppercase tracking-wider text-slate-500`}>{label}</th>)}</tr></thead>
        {!totalItems ? <tbody><tr><td colSpan={6} className="py-16 text-center text-xs font-bold text-slate-400">Nenhuma cobrança encontrada.</td></tr></tbody> : null}
        {groups.map(group => {
          const expanded = m.expandedGroups.has(group.key), state = m.groupItemsByKey.get(group.key);
          return <tbody key={group.key} className="divide-y divide-slate-100">
            <tr className="financial-data-group bg-slate-50/80 transition-colors hover:bg-blue-50/70"><td colSpan={6} className="p-0">
              <button type="button" onClick={() => m.toggleGroup(group.key)} aria-expanded={expanded}
                className="financial-group-toggle grid w-full grid-cols-[minmax(260px,1.5fr)_minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(140px,0.7fr)] items-center gap-4 px-5 py-4 text-left">
                <span className="flex min-w-0 items-center gap-3"><span className={`financial-group-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${expanded ? 'bg-[#001a33] text-white' : 'bg-white text-slate-500'}`}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span><span className="min-w-0">
                  <span className="block truncate text-sm font-black text-[#001a33]">{group.label}</span>
                  <span className="mt-1 block truncate text-[10px] font-bold text-slate-400">CPF/CNPJ: {group.first.clienteCpfCnpj || 'não informado'}</span></span></span>
                <span className="text-xs font-bold text-slate-600"><span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Parcelas</span>{group.itemCount} cobrança(s)</span>
                <span className="text-xs font-bold text-slate-600"><span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Situação</span>{group.pendingCount} pend. · {group.receivedCount} rec. · {group.canceledCount} canc.</span>
                <span className="text-right text-xs font-bold text-slate-600"><span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Próximo vencimento</span>
                  <span className="text-[10px] text-slate-400">{formatNextPendingDueDate(group.pendingCount, group.nextDue)}</span></span>
              </button></td></tr>
            {expanded && state?.isLoading ? <tr><td colSpan={6} role="status" className="py-8 text-center text-xs font-bold text-slate-400">Carregando parcelas...</td></tr> : null}
            {expanded && (state?.isError || state?.isPaused) ? <tr><td colSpan={6} className="p-4">{queryRecovery(group.key)}</td></tr> : null}
            {expanded ? state?.rows.map((item, index) => <ServiceReceivableRow key={item.id} item={item} index={index} compactPartner {...actions} />) : null}
            {expanded && group.itemCount > m.groupItemsPageSize ? <tr><td colSpan={6} className="px-5 py-3">{pagination(group.key, group.itemCount)}</td></tr> : null}
          </tbody>;
        })}
      </table></div>}
    </div>
    {!m.list.isPending && totalItems > 0 ? <footer className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>Mostrando {(m.page - 1) * m.pageSize + 1}-{Math.min(m.page * m.pageSize, totalItems)} de {totalItems} grupo(s), {data?.totalReceivables} cobrança(s)</span>
      <PageControls page={m.page} pages={totalPages} loading={m.list.isFetching} onChange={m.setPage} label="de serviços" />
    </footer> : null}
  </>;
}
