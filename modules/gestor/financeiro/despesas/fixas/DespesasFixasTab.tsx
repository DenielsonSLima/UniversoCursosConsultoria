// File: modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx

import React, { useMemo, useState } from 'react';
import {
  Plus, Search, LayoutGrid, LayoutList, Tag, RefreshCw,
  Building, CheckCircle2, Layers,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { despesasService, DespesaLancamento } from '../despesas.service';
import { despesasQueryKeys, DespesaStatusScope, DespesaTipo } from '../despesas.queryKeys';
import { useDespesasQueries } from '../hooks/useDespesasQueries';
import { useDespesasRealtime } from '../hooks/useDespesasRealtime';
import { useCategoriasFinanceirasQuery } from '../hooks/useCategoriasFinanceirasQuery';
import DespesaForm from '../components/DespesaForm';
import DespesaTable from '../components/DespesaTable';
import DespesaCard from '../components/DespesaCard';
import DespesaGroupedView from '../components/DespesaGroupedView';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import { useFinanceiroSharedQueries } from '../../hooks/useFinanceiroSharedQueries';
import {
  printReciboDespesa,
  despesaToReciboData,
} from '../../../cadastros/modelos-documentos/recibo/ReciboDespesaPreview';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Modal de Baixa
const BaixaModal: React.FC<{
  item: DespesaLancamento;
  contas: any[];
  onConfirm: (params: { contaBancariaId: string; valorPago: number; dataPagamento: string; formaPagamento: string }) => void;
  onClose: () => void;
  isPending: boolean;
}> = ({ item, contas, onConfirm, onClose, isPending }) => {
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [valorPago, setValorPago] = useState(
    item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const parseVal = (s: string) => Number(s.replace(/\./g, '').replace(',', '.') || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn">
        <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight mb-1">Dar Baixa</h3>
        <p className="text-xs text-slate-400 font-medium mb-6 truncate">{item.descricao}</p>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Conta Bancária *</label>
            <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Selecionar...</option>
              {contas.map((c: any) => <option key={c.id} value={c.id}>{c.banco} — {c.conta}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Valor Pago</label>
            <input type="text" value={valorPago} onChange={(e) => setValorPago(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Data do Pagamento</label>
            <input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Forma de Pagamento</label>
            <div className="flex gap-2">
              {['PIX', 'TED', 'BOLETO', 'DINHEIRO'].map((fp) => (
                <button key={fp} type="button" onClick={() => setFormaPagamento(fp)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase border transition-all ${formaPagamento === fp ? 'bg-emerald-600 text-white border-emerald-600' : 'text-slate-500 border-slate-200 hover:border-emerald-400'}`}>{fp}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 text-sm font-bold uppercase transition-colors">Cancelar</button>
          <button onClick={() => onConfirm({ contaBancariaId, valorPago: parseVal(valorPago), dataPagamento, formaPagamento })} disabled={!contaBancariaId || isPending} className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-black uppercase tracking-wide disabled:opacity-50 transition-colors">
            {isPending ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

const DespesasFixasTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();

  const [statusScope, setStatusScope] = useState<DespesaStatusScope>('mes_atual');
  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [viewMode, setViewMode] = useState<'tabela' | 'cards'>('tabela');
  const [agrupar, setAgrupar] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [baixaItem, setBaixaItem] = useState<DespesaLancamento | null>(null);

  useDespesasRealtime();

  const { accountsQuery, polosQuery, partnersQuery, turmasQuery } = useFinanceiroSharedQueries({ turmas: true });
  const polos = polosQuery.data || [];
  const contas = accountsQuery.data || [];
  const parceiros = partnersQuery.data || [];
  const turmas = turmasQuery?.data || [];

  const sessionPoloId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id') || '';
  }, []);
  const poloId = sessionPoloId || polos[0]?.id || '';

  const filters = useMemo(() => ({
    tipo: 'DESPESA_FIXA' as DespesaTipo,
    statusScope,
    dataInicio,
    dataFim,
    categoriaId,
    search,
    poloId,
    turmaId,
  }), [statusScope, dataInicio, dataFim, categoriaId, search, poloId, turmaId]);

  const { lancamentosQuery, summaryQuery } = useDespesasQueries(filters);
  const categoriasQuery = useCategoriasFinanceirasQuery('DESPESA_FIXA');

  const lancamentos = lancamentosQuery.data || [];
  const categorias = categoriasQuery.data || [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return lancamentos;
    return lancamentos.filter((i) =>
      [i.descricao, i.categoriaNome, i.fornecedorNome, i.poloNome]
        .some((f) => f?.toLowerCase().includes(term))
    );
  }, [lancamentos, search]);

  const totals = useMemo(() => ({
    total: summaryQuery.data?.totalValue || 0,
    pago: summaryQuery.data?.paidValue || 0,
    pendente: summaryQuery.data?.pendingValue || 0,
    vencidos: summaryQuery.data?.vencidosCount || 0,
  }), [summaryQuery.data]);

  const baixaMutation = useMutation({
    mutationFn: (params: { contaBancariaId: string; valorPago: number; dataPagamento: string; formaPagamento: string }) =>
      despesasService.markDespesaPaga(baixaItem!.id, params),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot });
      toast.success('Baixa confirmada!', 'O pagamento foi registrado com sucesso.');
      setBaixaItem(null);
    },
    onError: (err: any) => toast.error('Erro ao dar baixa', err.message),
  });

  const excluirMutation = useMutation({
    mutationFn: (id: string) => despesasService.deleteDespesa(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot });
      toast.success('Lançamento excluído', 'O registro foi removido com sucesso.');
    },
    onError: (err: any) => toast.error('Erro ao excluir', err.message),
  });

  const handleExcluir = (item: DespesaLancamento) => {
    if (confirm(`Excluir "${item.descricao}"?`)) excluirMutation.mutate(item.id);
  };

  const handleImprimir = (item: DespesaLancamento) => {
    printReciboDespesa(despesaToReciboData(item));
  };

  const tabs: { id: DespesaStatusScope; label: string }[] = [
    { id: 'mes_atual', label: 'Mês Atual' },
    { id: 'em_aberto', label: 'Em Aberto' },
    { id: 'todos', label: 'Todos' },
  ];

  return (
    <div className="space-y-5 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-base font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <Building size={16} className="text-rose-500" />
            Despesas Fixas
          </h4>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Aluguel, salários, energia e custos recorrentes
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wide shadow-md shadow-rose-900/20 transition-colors"
        >
          <Plus size={14} />
          Nova Despesa
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Previsto', value: formatCurrency(totals.total), color: 'text-[#001a33]' },
          { label: 'Pago', value: formatCurrency(totals.pago), color: 'text-emerald-600' },
          { label: 'A Pagar', value: formatCurrency(totals.pendente), color: 'text-amber-600' },
          { label: 'Vencidos', value: `${totals.vencidos}`, color: 'text-rose-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">{kpi.label}</p>
            <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs de status */}
      <div className="flex gap-2 border-b border-slate-100 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusScope(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${
              statusScope === tab.id
                ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                : 'text-slate-500 border-transparent hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Busca */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar lançamentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 outline-none transition-all"
          />
        </div>

        {/* Data Início */}
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none transition-all"
          title="Data Início"
        />

        {/* Data Fim */}
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none transition-all"
          title="Data Fim"
        />

        {/* Categoria */}
        <div className="relative">
          <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none appearance-none transition-all"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        {/* Turma */}
        <select
          value={turmaId}
          onChange={(e) => setTurmaId(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none transition-all"
        >
          <option value="">Todas as turmas</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </select>

        {/* Toggles */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl ml-auto">
          <button
            onClick={() => setViewMode('tabela')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'tabela' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="Tabela"
          >
            <LayoutList size={15} />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="Cards"
          >
            <LayoutGrid size={15} />
          </button>
        </div>

        <button
          onClick={() => setAgrupar((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold uppercase border transition-all ${
            agrupar ? 'bg-[#001a33] text-white border-[#001a33]' : 'text-slate-500 border-slate-200 hover:border-slate-400'
          }`}
        >
          <Layers size={13} />
          Agrupar
        </button>
      </div>

      {/* Lista */}
      {lancamentosQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-rose-500" />
        </div>
      ) : agrupar ? (
        <DespesaGroupedView
          items={filtered}
          viewMode={viewMode}
          onPagar={(item) => setBaixaItem(item)}
          onExcluir={handleExcluir}
          onImprimir={handleImprimir}
        />
      ) : viewMode === 'tabela' ? (
        <DespesaTable
          items={filtered}
          onPagar={(item) => setBaixaItem(item)}
          onExcluir={handleExcluir}
          onImprimir={handleImprimir}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <DespesaCard
              key={item.id}
              item={item}
              onPagar={(i) => setBaixaItem(i)}
              onExcluir={handleExcluir}
              onImprimir={handleImprimir}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <DespesaForm
          tipo="DESPESA_FIXA"
          poloId={poloId}
          polos={polos}
          contas={contas}
          parceiros={parceiros}
          turmas={turmas}
          onClose={() => setShowForm(false)}
          onSuccess={(created, mode) => {
            setShowForm(false);
            toast.success(
              mode === 'parcelado'
                ? `${created.length} parcelas lançadas!`
                : mode === 'baixa'
                ? 'Lançado e baixado!'
                : 'Lançamento criado!',
              `Despesa fixa registrada com sucesso.`
            );
          }}
        />
      )}

      {/* Baixa Modal */}
      {baixaItem && (
        <BaixaModal
          item={baixaItem}
          contas={contas.filter((c: any) => c.ativo !== false)}
          onConfirm={(params) => baixaMutation.mutate(params)}
          onClose={() => setBaixaItem(null)}
          isPending={baixaMutation.isPending}
        />
      )}
    </div>
  );
};

export default DespesasFixasTab;
