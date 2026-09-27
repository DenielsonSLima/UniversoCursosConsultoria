import React, { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Handshake,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { isContaDisponivelNoPolo } from '../financeiro.service';
import { useFinanceiroSharedQueries } from '../hooks/useFinanceiroSharedQueries';
import { invalidateConveniosScope } from './convenios.cache';
import { conveniosService } from './convenios.service';
import type {
  ConvenioFinanceiroMes,
  ConvenioStatusScope,
  CriarConvenioInput,
  FinalizarConvenioMesInput,
  LancarConvenioCreditoInput,
} from './convenios.types';
import { useConvenioDetailQuery, useConvenioPartnersQuery, useConveniosListQuery } from './hooks/useConveniosQueries';
import { useConveniosRealtime } from './hooks/useConveniosRealtime';
import ConvenioCloseMonthModal from './components/ConvenioCloseMonthModal';
import ConvenioCreditModal from './components/ConvenioCreditModal';
import ConvenioFormModal from './components/ConvenioFormModal';
import ConvenioMonthCard from './components/ConvenioMonthCard';
import ConvenioMonthDetailsPage from './components/ConvenioMonthDetailsPage';
import ConvenioMonthsTable from './components/ConvenioMonthsTable';
import ConveniosKpis from './components/ConveniosKpis';

interface ConveniosTabProps {
  poloId?: string | null;
}

type ViewMode = 'cards' | 'table';

const ConveniosTab: React.FC<ConveniosTabProps> = ({ poloId: scopedPoloId }) => {
  const poloId = scopedPoloId && scopedPoloId !== 'todos' ? scopedPoloId : '';
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [statusScope, setStatusScope] = useState<ConvenioStatusScope>('ABERTOS');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMes, setSelectedMes] = useState<ConvenioFinanceiroMes | null>(null);
  const [creditMes, setCreditMes] = useState<ConvenioFinanceiroMes | null>(null);
  const [closeMes, setCloseMes] = useState<ConvenioFinanceiroMes | null>(null);

  const shared = useFinanceiroSharedQueries({
    poloId,
    accounts: Boolean(poloId),
    partners: false,
    polos: true,
  });
  const contas = useMemo(
    () => (shared.accountsQuery.data || []).filter(
      (conta) => Boolean(conta.id) && conta.ativo !== false && isContaDisponivelNoPolo(conta, poloId),
    ),
    [poloId, shared.accountsQuery.data],
  );

  const listQuery = useConveniosListQuery(poloId, statusScope, deferredSearch);
  const partnersQuery = useConvenioPartnersQuery(poloId);
  const detailQuery = useConvenioDetailQuery(poloId, selectedMes?.id);
  useConveniosRealtime(poloId, Boolean(poloId));

  const createMutation = useMutation({
    mutationFn: (input: CriarConvenioInput) => conveniosService.criar(input),
    onSuccess: async (result) => {
      await invalidateConveniosScope(queryClient, poloId, result.mes.id);
      setShowCreate(false);
      setStatusScope('ABERTOS');
      setSelectedMes(result.mes);
      toast.success(
        result.replayed ? 'Convênio já registrado' : 'Convênio criado',
        result.replayed
          ? 'A mesma solicitação já havia sido confirmada pelo backend.'
          : 'A primeira competência foi aberta com saldo inicial zero.',
      );
    },
    onError: (error: Error) => toast.error('Erro ao criar convênio', error.message),
  });

  const creditMutation = useMutation({
    mutationFn: (input: LancarConvenioCreditoInput) => conveniosService.lancarCredito(input),
    onSuccess: async (result) => {
      await invalidateConveniosScope(queryClient, poloId, result.mes.id);
      setCreditMes(null);
      setSelectedMes(result.mes);
      toast.success(
        result.replayed ? 'Crédito já registrado' : 'Crédito confirmado',
        result.replayed
          ? 'O backend reconheceu a repetição segura desta solicitação.'
          : 'A conta física e o saldo do convênio foram atualizados.',
      );
    },
    onError: (error: Error) => toast.error('Erro ao lançar crédito', error.message),
  });

  const closeMutation = useMutation({
    mutationFn: (input: FinalizarConvenioMesInput) => conveniosService.finalizar(input),
    onSuccess: async (result) => {
      await invalidateConveniosScope(queryClient, poloId);
      setCloseMes(null);
      if (result.proximaMes) {
        setStatusScope('ABERTOS');
        setSelectedMes(result.proximaMes);
      } else {
        setStatusScope('FINALIZADOS');
        setSelectedMes(result.mesFechado);
      }
      toast.success(
        result.replayed ? 'Fechamento já confirmado' : 'Mês finalizado',
        result.proximaMes
          ? 'O saldo final foi carregado na competência seguinte.'
          : 'O snapshot mensal foi fechado e preservado.',
      );
    },
    onError: (error: Error) => toast.error('Erro ao finalizar mês', error.message),
  });

  const items = listQuery.data?.itens || [];
  const resumo = listQuery.data?.resumo;

  if (selectedMes) {
    return (
      <div className="space-y-5">
        <ToastNotification toasts={toasts} onRemove={removeToast} />
        <ConvenioMonthDetailsPage
          mesFallback={selectedMes}
          detail={detailQuery.data}
          isLoading={detailQuery.isPending}
          error={detailQuery.error as Error | null}
          onBack={() => setSelectedMes(null)}
          onCredit={setCreditMes}
          onCloseMonth={setCloseMes}
          onRetry={() => { void detailQuery.refetch(); }}
        />
        {creditMes ? <ConvenioCreditModal mes={creditMes} contas={contas} isPending={creditMutation.isPending} error={creditMutation.error as Error | null} onClose={() => { if (!creditMutation.isPending) setCreditMes(null); }} onConfirm={(input) => creditMutation.mutate(input)} /> : null}
        {closeMes ? <ConvenioCloseMonthModal mes={closeMes} isPending={closeMutation.isPending} error={closeMutation.error as Error | null} onClose={() => { if (!closeMutation.isPending) setCloseMes(null); }} onConfirm={(input) => closeMutation.mutate(input)} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Handshake size={16} /> Recursos vinculados</p>
          <h3 className="mt-1 text-2xl font-black uppercase tracking-tight text-[#001a33]">Convênios</h3>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">Controle mensal separado por convênio, com créditos reais, despesas vinculadas e fechamento manual.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} disabled={!poloId} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-cyan-950/15 hover:bg-cyan-800 disabled:opacity-50"><Plus size={16} /> Novo convênio</button>
      </header>

      {resumo ? <ConveniosKpis resumo={resumo} /> : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Situação dos meses de convênio">
          {([
            ['ABERTOS', 'Em aberto', resumo?.mesesAbertos],
            ['FINALIZADOS', 'Finalizados', resumo?.mesesFinalizados],
          ] as const).map(([scope, label, count]) => (
            <button key={scope} type="button" role="tab" aria-selected={statusScope === scope} onClick={() => setStatusScope(scope)} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide ${statusScope === scope ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}{count !== undefined ? <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5">{count}</span> : null}</button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar convênio, parceiro ou competência..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-500" />
        </div>
        <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-white p-1" aria-label="Forma de visualização">
          <button type="button" onClick={() => setViewMode('cards')} aria-label="Visualizar como cards" aria-pressed={viewMode === 'cards'} className={`rounded-lg p-2 ${viewMode === 'cards' ? 'bg-cyan-50 text-cyan-800' : 'text-slate-400'}`}><LayoutGrid size={16} /></button>
          <button type="button" onClick={() => setViewMode('table')} aria-label="Visualizar como tabela" aria-pressed={viewMode === 'table'} className={`rounded-lg p-2 ${viewMode === 'table' ? 'bg-cyan-50 text-cyan-800' : 'text-slate-400'}`}><List size={16} /></button>
        </div>
      </div>

      {!poloId ? (
        <div className="rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/40 py-16 text-center text-cyan-900">
          <Handshake size={44} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-black uppercase tracking-wide">Selecione um polo</p>
          <p className="mt-1 text-xs font-medium text-cyan-800/70">O controle de convênios é separado por unidade.</p>
        </div>
      ) : listQuery.isPending ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 py-16 text-sm font-bold text-slate-400"><Loader2 size={18} className="animate-spin" /> Carregando convênios...</div>
      ) : listQuery.isError ? (
        <div role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">Não foi possível carregar os convênios. {(listQuery.error as Error)?.message || ''}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-400"><Handshake size={44} className="mx-auto mb-3 opacity-30" /><p className="text-sm font-black uppercase tracking-wide">Nenhum mês encontrado</p><p className="mt-1 text-xs font-medium">Crie um convênio ou ajuste a busca e o status.</p></div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((mes) => <ConvenioMonthCard key={mes.id} mes={mes} onOpen={setSelectedMes} onCloseMonth={setCloseMes} />)}</div>
      ) : (
        <ConvenioMonthsTable items={items} onOpen={setSelectedMes} onCloseMonth={setCloseMes} />
      )}

      {showCreate ? <ConvenioFormModal poloId={poloId} parceiros={partnersQuery.data || []} parceirosLoading={partnersQuery.isPending} parceirosError={partnersQuery.isError} isPending={createMutation.isPending} error={createMutation.error as Error | null} onClose={() => { if (!createMutation.isPending) setShowCreate(false); }} onConfirm={(input) => createMutation.mutate(input)} /> : null}
      {closeMes ? <ConvenioCloseMonthModal mes={closeMes} isPending={closeMutation.isPending} error={closeMutation.error as Error | null} onClose={() => { if (!closeMutation.isPending) setCloseMes(null); }} onConfirm={(input) => closeMutation.mutate(input)} /> : null}
    </div>
  );
};

export default ConveniosTab;
