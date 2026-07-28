// File: modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx

import React, { useMemo, useState } from 'react';
import {
  Plus, Search, LayoutGrid, LayoutList, Tag, RefreshCw,
  ShoppingBag, Layers,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { despesasService, DespesaBaixaParams, DespesaLancamento } from '../despesas.service';
import { despesasQueryKeys, DespesaStatusScope, DespesaTipo } from '../despesas.queryKeys';
import { useDespesasQueries } from '../hooks/useDespesasQueries';
import { useDespesasRealtime } from '../hooks/useDespesasRealtime';
import { useCategoriasFinanceirasQuery } from '../hooks/useCategoriasFinanceirasQuery';
import DespesaForm from '../components/DespesaForm';
import DespesaTable from '../components/DespesaTable';
import DespesaCard from '../components/DespesaCard';
import DespesaGroupedView from '../components/DespesaGroupedView';
import DespesaBaixaModal from '../components/DespesaBaixaModal';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import { useFinanceiroSharedQueries } from '../../hooks/useFinanceiroSharedQueries';
import {
  printReciboDespesa,
  despesaToReciboData,
} from '../../../cadastros/modelos-documentos/recibo/ReciboDespesaPreview';
import FinancialReportExportButton, {
  FinancialReportColumn,
  FinancialReportFilter,
  FinancialReportRow,
  FinancialReportStatusBadge,
  FinancialReportSummaryCard,
} from '../../components/FinancialReportPreview';
import FinancialUnderlineTabs from '../../components/FinancialUnderlineTabs';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { caixaQueryKeys } from '../../../caixa/caixa.service';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem limite';

const statusScopeLabels: Record<DespesaStatusScope, string> = {
  mes_atual: 'Mês atual',
  em_aberto: 'Em aberto',
  todos: 'Todos',
};

const DespesasVariaveisTab: React.FC<{ poloId?: string | null }> = ({ poloId: scopedPoloId }) => {
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

  useDespesasRealtime(scopedPoloId);

  const { accountsQuery, polosQuery, partnersQuery, turmasQuery } = useFinanceiroSharedQueries({ turmas: true, poloId: scopedPoloId });
  const polos = polosQuery.data || [];
  const contas = accountsQuery.data || [];
  const parceiros = partnersQuery.data || [];
  const turmas = turmasQuery?.data || [];

  const poloId = scopedPoloId || '';

  const filters = useMemo(() => ({
    tipo: 'DESPESA_VARIAVEL' as DespesaTipo,
    statusScope,
    dataInicio,
    dataFim,
    categoriaId,
    search,
    poloId,
    turmaId,
  }), [statusScope, dataInicio, dataFim, categoriaId, search, poloId, turmaId]);

  const { lancamentosQuery, summaryQuery, groupSummaryQuery } = useDespesasQueries(filters, {
    groupSummary: agrupar,
  });
  const categoriasQuery = useCategoriasFinanceirasQuery('DESPESA_VARIAVEL');

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

  const selectedCategoriaLabel = useMemo(
    () => categoriaId ? categorias.find((categoria) => categoria.id === categoriaId)?.nome || 'Categoria selecionada' : 'Todas as categorias',
    [categoriaId, categorias],
  );
  const selectedTurmaLabel = useMemo(
    () => turmaId ? turmas.find((turma: any) => turma.id === turmaId)?.nome || 'Turma selecionada' : 'Todas as turmas',
    [turmaId, turmas],
  );
  const selectedPoloLabel = useMemo(
    () => polos.find((polo: any) => polo.id === poloId)?.nome || 'Polo atual',
    [poloId, polos],
  );

  const reportColumns = useMemo<FinancialReportColumn[]>(() => [
    { label: 'Vencimento' },
    { label: 'Descrição' },
    { label: 'Categoria' },
    { label: 'Fornecedor' },
    { label: 'Valor', align: 'right' },
    { label: 'Parcela', align: 'center' },
    { label: 'Status', align: 'center' },
  ], []);

  const reportRows = useMemo<FinancialReportRow[]>(() => filtered.map((item) => ({
    id: item.id,
    cells: [
      <span className="font-bold text-slate-700">{formatDate(item.dataVencimento)}</span>,
      <div>
        <p className="font-black text-[#001a33]">{item.descricao}</p>
        {item.turmaNome && <p className="mt-0.5 font-bold text-indigo-600">Turma: {item.turmaNome}</p>}
        {item.observacao && <p className="mt-0.5 text-slate-500">{item.observacao}</p>}
        {item.dataPagamento && <p className="mt-0.5 font-bold text-emerald-700">Pago em {formatDate(item.dataPagamento)}</p>}
      </div>,
      item.categoriaNome || 'Sem categoria',
      item.fornecedorNome || 'Não informado',
      <div>
        <p className="font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
        {item.valorPago !== undefined && item.valorPago !== item.valor && (
          <p className="text-[9px] font-bold text-emerald-700">Pago: {formatCurrency(item.valorPago)}</p>
        )}
      </div>,
      item.totalParcelas > 1 ? `${item.parcelaNumero}/${item.totalParcelas}` : 'Única',
      <FinancialReportStatusBadge status={item.status} />,
    ],
  })), [filtered]);

  const reportFilters = useMemo<FinancialReportFilter[]>(() => [
    { label: 'Escopo', value: statusScopeLabels[statusScope] },
    { label: 'Busca', value: search.trim() || 'Todos os lançamentos' },
    { label: 'Período', value: `${formatDate(dataInicio)} até ${formatDate(dataFim)}` },
    { label: 'Categoria', value: selectedCategoriaLabel },
    { label: 'Turma', value: selectedTurmaLabel },
    { label: 'Polo', value: selectedPoloLabel },
  ], [dataFim, dataInicio, search, selectedCategoriaLabel, selectedPoloLabel, selectedTurmaLabel, statusScope]);

  const reportSummaryCards = useMemo<FinancialReportSummaryCard[]>(() => [
    { label: 'Total previsto', value: formatCurrency(totals.total), tone: 'slate' },
    { label: 'Pago', value: formatCurrency(totals.pago), tone: 'emerald' },
    { label: 'A pagar', value: formatCurrency(totals.pendente), tone: 'amber' },
    { label: 'Vencidos', value: totals.vencidos, tone: 'rose' },
  ], [totals]);

  const baixaMutation = useMutation({
    mutationFn: (params: DespesaBaixaParams) =>
      despesasService.markDespesaPaga(baixaItem!.id, params),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
      ]);
      toast.success('Baixa confirmada!', 'O pagamento foi registrado com sucesso.');
      setBaixaItem(null);
    },
    onError: (err: any) => toast.error('Erro ao dar baixa', err.message),
  });

  const excluirMutation = useMutation({
    mutationFn: (id: string) => despesasService.deleteDespesa(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
      ]);
      toast.success('Lançamento cancelado', 'O histórico foi preservado.');
    },
    onError: (err: any) => toast.error('Erro ao excluir', err.message),
  });

  const handleExcluir = (item: DespesaLancamento) => {
    if (confirm(`Excluir "${item.descricao}"?`)) excluirMutation.mutate(item.id);
  };
  const handleImprimir = (item: DespesaLancamento) => printReciboDespesa(despesaToReciboData(item));
  const handleAnexo = async (item: DespesaLancamento) => {
    const preview = window.open('about:blank', '_blank');
    if (preview) preview.opener = null;
    try {
      const url = await despesasService.getDespesaAnexoUrl(item);
      if (preview) preview.location.replace(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      preview?.close();
      toast.error('Erro ao abrir anexo', error?.message || 'Não foi possível abrir o arquivo.');
    }
  };

  const tabs: { id: DespesaStatusScope; label: string }[] = [
    { id: 'mes_atual', label: 'Mês Atual' },
    { id: 'em_aberto', label: 'Em Aberto' },
    { id: 'todos', label: 'Todos' },
  ];

  return (
    <div className="space-y-5 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-base font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <ShoppingBag size={16} className="text-rose-500" />
            Despesas Variáveis
          </h4>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Materiais, manutenção, serviços pontuais e despesas não recorrentes
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
          { label: 'Total Previsto', value: !poloId ? 'Selecione um polo' : summaryQuery.isPending ? 'Carregando...' : summaryQuery.isError ? 'Indisponível' : formatCurrency(totals.total), color: 'text-[#001a33]' },
          { label: 'Pago', value: !poloId ? 'Selecione um polo' : summaryQuery.isPending ? 'Carregando...' : summaryQuery.isError ? 'Indisponível' : formatCurrency(totals.pago), color: 'text-emerald-600' },
          { label: 'A Pagar', value: !poloId ? 'Selecione um polo' : summaryQuery.isPending ? 'Carregando...' : summaryQuery.isError ? 'Indisponível' : formatCurrency(totals.pendente), color: 'text-amber-600' },
          { label: 'Vencidos', value: !poloId ? 'Selecione um polo' : summaryQuery.isPending ? 'Carregando...' : summaryQuery.isError ? 'Indisponível' : `${totals.vencidos}`, color: 'text-rose-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">{kpi.label}</p>
            <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>
      {summaryQuery.isError && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">
          Não foi possível carregar o resumo canônico das despesas.
        </div>
      )}

      <FinancialUnderlineTabs
        items={tabs}
        value={statusScope}
        onChange={setStatusScope}
        ariaLabel="Período das despesas variáveis"
        indicatorClassName="bg-rose-600"
        activeIconClassName="text-rose-600"
      />

      <div className="flex flex-wrap gap-3 items-center">
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
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none transition-all" title="Data Início" />
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none transition-all" title="Data Fim" />
        <div className="relative">
          <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none appearance-none transition-all">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FinancialReportExportButton
            title="Extrato de Despesas Variáveis"
            subtitle="Despesas pontuais e contas a pagar conforme os filtros selecionados."
            rightTitle="Extrato de Despesas"
            rightType="Despesas variáveis"
            fileName={`extrato-despesas-variaveis-${new Date().toISOString().slice(0, 10)}`}
            columns={reportColumns}
            rows={reportRows}
            filters={reportFilters}
            summaryCards={reportSummaryCards}
            poloId={poloId}
            tone="rose"
            disabled={lancamentosQuery.isLoading || !summaryQuery.isSuccess}
          />
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            <button onClick={() => setViewMode('tabela')} className={`p-2 rounded-lg transition-all ${viewMode === 'tabela' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-400 hover:text-slate-600'}`} title="Tabela"><LayoutList size={15} /></button>
            <button onClick={() => setViewMode('cards')} className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-400 hover:text-slate-600'}`} title="Cards"><LayoutGrid size={15} /></button>
          </div>
          <button onClick={() => setAgrupar((v) => !v)} className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold uppercase border transition-all ${agrupar ? 'bg-[#001a33] text-white border-[#001a33]' : 'text-slate-500 border-slate-200 hover:border-slate-400'}`}>
            <Layers size={13} />Agrupar
          </button>
        </div>
      </div>

      {lancamentosQuery.isLoading || (agrupar && groupSummaryQuery.isLoading) ? (
        <div className="flex items-center justify-center py-16"><RefreshCw size={28} className="animate-spin text-rose-500" /></div>
      ) : !poloId ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-6 text-center text-sm font-bold text-amber-700">
          Selecione um polo para carregar as despesas.
        </div>
      ) : lancamentosQuery.isError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-6 text-center text-sm font-bold text-rose-700">
          Não foi possível carregar os lançamentos de despesas.
        </div>
      ) : agrupar && groupSummaryQuery.isError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-6 text-center text-sm font-bold text-rose-700">
          Não foi possível carregar os totais canônicos por categoria.
        </div>
      ) : agrupar ? (
        <DespesaGroupedView items={filtered} summaries={groupSummaryQuery.data || []} viewMode={viewMode} onPagar={(item) => setBaixaItem(item)} onExcluir={handleExcluir} onImprimir={handleImprimir} onAnexo={handleAnexo} />
      ) : viewMode === 'tabela' ? (
        <DespesaTable items={filtered} onPagar={(item) => setBaixaItem(item)} onExcluir={handleExcluir} onImprimir={handleImprimir} onAnexo={handleAnexo} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <DespesaCard key={item.id} item={item} onPagar={(i) => setBaixaItem(i)} onExcluir={handleExcluir} onImprimir={handleImprimir} onAnexo={handleAnexo} />
          ))}
        </div>
      )}

      {showForm && (
        <DespesaForm
          tipo="DESPESA_VARIAVEL"
          poloId={poloId}
          polos={polos}
          contas={contas}
          parceiros={parceiros}
          turmas={turmas}
          onClose={() => setShowForm(false)}
          onSuccess={(created, mode) => {
            setShowForm(false);
            toast.success(mode === 'parcelado' ? `${created.length} parcelas lançadas!` : mode === 'baixa' ? 'Lançado e baixado!' : 'Lançamento criado!', 'Despesa variável registrada com sucesso.');
          }}
        />
      )}

      {baixaItem && (
        <DespesaBaixaModal
          item={baixaItem}
          contas={contas}
          poloId={poloId}
          onConfirm={(params) => baixaMutation.mutate(params)}
          onClose={() => setBaixaItem(null)}
          isPending={baixaMutation.isPending}
        />
      )}
    </div>
  );
};

export default DespesasVariaveisTab;
