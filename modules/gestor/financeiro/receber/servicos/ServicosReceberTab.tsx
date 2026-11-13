import React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import ToastNotification from '../../../components/ToastNotification';
import FinancialUnderlineTabs from '../../components/FinancialUnderlineTabs';
import { FinancialPaymentModal } from '../../settlements/FinancialPaymentModal';
import { OtherCreditPaymentModal } from '../../outros-creditos/OtherCreditPaymentModal';
import { formatCurrency } from '../../outros-creditos/outros-creditos.presentation';
import { useServicosReceber } from './useServicosReceber';
import { ServiceReceivableRow } from './ServiceReceivableRow';
import type { ServiceStatusScope } from './servicos-receber.contract';

export default function ServicosReceberTab({ poloId }: { poloId?: string | null }) {
  const m = useServicosReceber(poloId), totals = m.summary.isError || m.periodError ? undefined : m.summary.data;
  const data = m.list.isError || m.periodError ? undefined : m.list.data;
  const pages = Math.max(1, Math.ceil((data?.totalItems || 0) / m.pageSize));
  const error = m.list.error || m.summary.error;
  return <section className="financial-section-workspace space-y-5" aria-label="Contas a receber de serviços">
    <ToastNotification toasts={m.toasts} onRemove={m.removeToast} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
      ['Total lançado', totals ? formatCurrency(totals.allValue) : '—'], ['Recebido', totals ? formatCurrency(totals.receivedValue) : '—'],
      ['A receber', totals ? formatCurrency(totals.pendingValue) : '—'], ['Vencidos', totals ? String(totals.overdueCount) : '—'],
    ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-medium text-[#001a33]">{value}</p></div>)}</div>
    <FinancialUnderlineTabs compact value={m.statusScope} onChange={m.setStatusScope} ariaLabel="Situação financeira dos serviços"
      items={([{ id: 'PENDING', label: 'Pendentes' }, { id: 'RECEIVED', label: 'Recebidos' }, { id: 'OVERDUE', label: 'Vencidos' },
        { id: 'CANCELLED', label: 'Cancelados' }, { id: 'ALL', label: 'Todos' }] as Array<{ id: ServiceStatusScope; label: string }>)} />
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <label className="min-w-48 flex-1 text-xs text-slate-500">Buscar serviços<div className="relative mt-1"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input aria-label="Buscar serviços" value={m.search} maxLength={200} placeholder="Parceiro, serviço ou NFS-e" onChange={e => m.setSearch(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></div></label>
      <label className="text-xs text-slate-500">Vencimento inicial<input aria-label="Vencimento inicial" type="date" value={m.dueStart} onChange={e => m.setDueStart(e.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm" /></label>
      <label className="text-xs text-slate-500">Vencimento final<input aria-label="Vencimento final" type="date" value={m.dueEnd} onChange={e => m.setDueEnd(e.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm" /></label>
    </div>
    {m.periodError && <p role="alert" className="text-sm text-rose-700">A data final deve ser igual ou posterior à inicial.</p>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Não foi possível consultar os serviços. <button type="button" onClick={() => { void m.list.refetch(); void m.summary.refetch(); }} className="underline">Tentar novamente</button></div>}
    {m.list.isPending && !m.periodError ? <p role="status" className="py-10 text-center text-sm text-slate-500">Consultando serviços...</p>
      : data?.rows.length ? <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="financial-data-table w-full min-w-[860px] text-left"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Parceiro', 'Serviço / NFS-e', 'Vencimento', 'Situação', 'Valores', 'Ações'].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{data.rows.map(item => <ServiceReceivableRow key={item.id} item={item} onReceive={item => { m.payment.reset(); m.setSelected(item); }} onBolepix={m.setBolepixId} />)}</tbody></table></div>
        : !error && !m.periodError ? <p className="py-10 text-center text-sm text-slate-500">Nenhum recebível de serviço encontrado neste filtro.</p> : null}
    {data && <footer className="flex items-center justify-between gap-3 text-xs text-slate-500"><span>{data.totalItems} lançamento(s)</span><div className="flex items-center gap-3"><button type="button" aria-label="Página anterior de serviços" disabled={m.page <= 1 || m.list.isFetching} onClick={() => m.setPage(m.page - 1)} className="rounded-lg border bg-white p-2 disabled:opacity-30"><ChevronLeft size={16} /></button><span>Página {m.page} de {pages}</span><button type="button" aria-label="Próxima página de serviços" disabled={m.page >= pages || m.list.isFetching} onClick={() => m.setPage(m.page + 1)} className="rounded-lg border bg-white p-2 disabled:opacity-30"><ChevronRight size={16} /></button></div></footer>}
    {m.selected && <FinancialPaymentModal sourceKind="RECEIVABLE" sourceId={m.selected.id!} poloId={m.selected.poloId}
      description={m.selected.descricao} partnerName={m.selected.clienteNome} accounts={m.accountsQuery.isError ? [] : m.accountsQuery.data || []}
      readOnly={m.selected.status === 'PAGO' || ['CANCELADO', 'ESTORNADO', 'DEVOLVIDO'].includes(m.selected.status)}
      onClose={() => m.setSelected(null)} onConfirm={payload => m.payment.mutateAsync(payload)} />}
    {m.bolepixId && <OtherCreditPaymentModal receivableId={m.bolepixId} onClose={() => m.setBolepixId(null)} />}
  </section>;
}
