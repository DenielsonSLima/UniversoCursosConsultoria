import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, LockKeyhole } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import InstitutionalSelect from '../../../../../shared/components/InstitutionalSelect';
import type { FinanceiroTabId } from '../../../../access-control';
import {
  professorFinanceSources, queryProfessorFinance,
  type ProfessorFinanceItem, type ProfessorFinanceSource, type ProfessorFinanceStatus,
} from './professor-financeiro.query';

interface Props {
  professorId: string;
  poloId?: string | null;
  cacheScope?: string;
  allowedFinancialTabs?: readonly FinanceiroTabId[];
}

const currency = (value: number | null) => value === null ? 'Não informado'
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const date = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado';
const statuses = [
  { value: 'todos', label: 'Todos os status' }, { value: 'abertos', label: 'Em aberto' },
  { value: 'pagos', label: 'Pagos' }, { value: 'cancelados', label: 'Cancelados e estornados' },
];
const statusLabel: Record<string, string> = {
  PENDENTE: 'Pendente', VENCIDO: 'Vencido', PAGO: 'Pago', CANCELADO: 'Cancelado',
  ESTORNADO: 'Estornado', DEVOLVIDO: 'Devolvido', SUSPENSO: 'Suspenso',
};
const statusClass: Record<string, string> = {
  PENDENTE: 'bg-amber-50 text-amber-800', VENCIDO: 'bg-rose-50 text-rose-700',
  PAGO: 'bg-emerald-50 text-emerald-700', SUSPENSO: 'bg-blue-50 text-blue-700',
};

const FinancialItem: React.FC<{ item: ProfessorFinanceItem }> = ({ item }) => {
  return (
    <details className="rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-3 text-[13px] focus-visible:outline-blue-500">
        <span className="min-w-0 flex-1 break-words font-medium text-slate-800">{item.description}</span>
        <span className="text-xs text-slate-600">Vencimento: {date(item.dueDate)}</span>
        <span className="font-semibold tabular-nums text-[#001a33]">{currency(item.value)}</span>
        <span className={`rounded-md px-2 py-1 text-xs ${statusClass[item.status] || 'bg-slate-100 text-slate-600'}`}>
          {statusLabel[item.status] || item.status}
        </span>
        <span className="text-xs text-blue-700">Detalhes</span>
      </summary>
      <div className="grid gap-3 border-t border-slate-100 px-3 py-3 text-[13px] sm:grid-cols-3">
        <Detail label="Valor pago" value={currency(item.paidValue)} />
        <Detail label="Data do pagamento" value={date(item.paymentDate)} />
        <Detail label="Forma do pagamento" value={item.paymentMethod || 'Não informada'} />
        {item.baseValue !== null && <Detail label="Valor base" value={currency(item.baseValue)} />}
        {item.interest !== null && <Detail label="Juros" value={currency(item.interest)} />}
        {item.fine !== null && <Detail label="Multa" value={currency(item.fine)} />}
        {item.discount !== null && <Detail label="Desconto" value={currency(item.discount)} />}
        {item.installment !== null && item.installments !== null && (
          <Detail label="Parcela" value={`${item.installment} de ${item.installments}`} />
        )}
        {item.note && <div className="sm:col-span-3"><Detail label="Observação" value={item.note} /></div>}
      </div>
    </details>
  );
};

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words text-slate-700">{value}</p></div>;
}

const ParceiroProfessorFinanceiro: React.FC<Props> = ({ professorId, poloId, cacheScope, allowedFinancialTabs = [] }) => {
  const queryClient = useQueryClient();
  const availableSources = professorFinanceSources.filter(source => allowedFinancialTabs.includes(source.permission));
  const [selectedSource, setSelectedSource] = useState<ProfessorFinanceSource>('despesas');
  const source = availableSources.find(item => item.id === selectedSource) || availableSources[0];
  const [status, setStatus] = useState<ProfessorFinanceStatus>('todos');
  const [page, setPage] = useState(1);
  const enabled = Boolean(source && cacheScope && poloId && poloId !== 'todos');
  const queryKey = ['parceiro-professor-financeiro', professorId, poloId, cacheScope, source?.id, status, page];
  const financialQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => queryProfessorFinance(supabase, {
      professorId, poloId: poloId!, source: source!.id, status, page, pageSize: 10,
    }, allowedFinancialTabs, signal),
    enabled, staleTime: 0, gcTime: 0, retry: 2, refetchOnReconnect: 'always',
  });

  useEffect(() => { setPage(1); }, [professorId, poloId, cacheScope, source?.id]);
  useEffect(() => {
    if (financialQuery.data) setPage(current => Math.min(current, Math.max(1, Math.ceil(financialQuery.data.totalItems / 10))));
  }, [financialQuery.data?.totalItems]);
  useEffect(() => {
    if (!enabled || !source || !poloId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`professor-financeiro-${professorId}-${poloId}-${source.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'finance_realtime_events', filter: `polo_id=eq.${poloId}` }, (payload) => {
        if (payload.new.source_table !== source.table) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['parceiro-professor-financeiro', professorId, poloId, cacheScope] }), 250);
      }).subscribe((state) => {
        if (state === 'SUBSCRIBED') void queryClient.invalidateQueries({ queryKey: ['parceiro-professor-financeiro', professorId, poloId, cacheScope] });
      });
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [enabled, professorId, poloId, cacheScope, source?.id, source?.table, queryClient]);

  if (!source) return <div className="flex items-start gap-2 rounded-lg border border-slate-200 p-4 text-[13px] text-slate-600"><LockKeyhole size={18} className="shrink-0" />Seu acesso não permite consultar lançamentos financeiros.</div>;
  if (!enabled) return <p role="status" className="py-6 text-[13px] text-slate-600">Selecione uma unidade para consultar o financeiro do professor.</p>;

  const total = financialQuery.data?.totalItems || 0;
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <section className="space-y-4" aria-label="Financeiro do professor">
      <div className="text-[13px] text-slate-600">
        <p>A pagar: valores da instituição para o professor. A receber: valores do professor para a instituição.</p>
        <p className="mt-1 text-xs">Valores e status registrados na unidade selecionada. As alterações e baixas são realizadas no módulo Financeiro.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-60"><label htmlFor="professor-finance-source" className="mb-1 block text-xs text-slate-600">Lançamentos</label>
          <InstitutionalSelect id="professor-finance-source" ariaLabel="Origem dos lançamentos financeiros" value={source.id}
            onValueChange={value => { setSelectedSource(value as ProfessorFinanceSource); setPage(1); }}
            options={availableSources.map(item => ({ value: item.id, label: item.label }))} />
        </div>
        <div className="min-w-0 flex-1 basis-48"><label htmlFor="professor-finance-status" className="mb-1 block text-xs text-slate-600">Status registrado</label>
          <InstitutionalSelect id="professor-finance-status" ariaLabel="Status dos lançamentos financeiros" value={status}
            onValueChange={value => { setStatus(value as ProfessorFinanceStatus); setPage(1); }} options={statuses} />
        </div>

      </div>
      {financialQuery.isPending ? <p role="status" className="flex items-center gap-2 py-6 text-[13px] text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando lançamentos…</p>
        : financialQuery.isError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">Não foi possível carregar os lançamentos. A conexão será retomada automaticamente.</div>
          : <>
            <p aria-live="polite" className="text-xs text-slate-600">{total} lançamento(s) em {source.label.toLocaleLowerCase('pt-BR')}.</p>
            <div className="space-y-2">{financialQuery.data.items.map(item => <FinancialItem key={item.id} item={item} />)}</div>
            {!financialQuery.data.items.length && <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[13px] text-slate-500">Nenhum lançamento vinculado ao professor com estes filtros.</p>}
            {pages > 1 && <nav aria-label="Páginas dos lançamentos" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>Página {page} de {pages}</span>
              <div className="flex gap-2"><button type="button" disabled={page <= 1 || financialQuery.isFetching} onClick={() => setPage(value => value - 1)} aria-label="Página anterior" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40"><ChevronLeft size={14} />Anterior</button>
                <button type="button" disabled={page >= pages || financialQuery.isFetching} onClick={() => setPage(value => value + 1)} aria-label="Próxima página" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40">Próxima<ChevronRight size={14} /></button></div>
            </nav>}
          </>}
    </section>
  );
};

export default ParceiroProfessorFinanceiro;
