import React, { useMemo } from 'react';
import { Banknote, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, QrCode, Search, WalletCards, XCircle } from 'lucide-react';
import ToastNotification from '../../components/ToastNotification';
import ManualSettlementModal from '../receber/components/manual-settlement/ManualSettlementModal';
import FinancialUnderlineTabs from '../components/FinancialUnderlineTabs';
import { useOutrosCreditos } from './useOutrosCreditos';
import { OtherCreditRow } from './OtherCreditRow';
import { OtherCreditPaymentModal } from './OtherCreditPaymentModal';
import { OtherCreditCreateModal } from './OtherCreditCreateModal';
import { OtherCreditPdvModal } from './OtherCreditPdvModal';
import { OtherCreditPlanModal } from './OtherCreditPlanModal';
import { useOtherCreditPlan } from './useOtherCreditPlan';
import { formatCurrency, formatDate, type OtherCreditGroupMode } from './outros-creditos.presentation';
import { useOtherCreditCancellation } from './useOtherCreditCancellation';
import { OtherCreditCancellationModal } from './OtherCreditCancellationModal';
import { OtherCreditSelectionCheckbox } from './OtherCreditSelectionCheckbox';
import { OTHER_CREDIT_CANCELLATION_LIMIT, selectableOtherCredits } from './other-credit-cancellation.selection';

interface OutrosCreditosTabProps { poloId?: string | null; }

const OutrosCreditosTab: React.FC<OutrosCreditosTabProps> = ({ poloId }) => {
  const model = useOutrosCreditos(poloId);
  const planModel = useOtherCreditPlan(poloId);
  const {
    toasts, removeToast, statusScope, setStatusScope, search, setSearch,
    startDate, setStartDate, endDate, setEndDate, categoryFilterId, setCategoryFilterId,
    setPage, groupMode, setGroupMode, expandedGroups, receiveItem,
    setReceiveItem, categories, isLoading, receiveAccounts, receiveMutation,
    openCreateModal, filtered, totals, kpis, allGroups, totalItems,
    totalPages, currentPage, pageItems, pageGroups, toggleGroup, getGroupSummary,
  } = model;
  const visibleItems = useMemo(() => groupMode === 'none' ? pageItems : pageGroups.flatMap(group => group.items), [groupMode, pageItems, pageGroups]);
  const selectionScope = JSON.stringify([poloId, statusScope, search, startDate, endDate, categoryFilterId, groupMode, currentPage]);
  const cancellation = useOtherCreditCancellation(visibleItems, selectionScope, model.credits, poloId);
  const eligiblePageItems = selectableOtherCredits(visibleItems).filter(item => !cancellation.reservedIds.has(item.id!));
  const selectedPageCount = eligiblePageItems.filter(item => cancellation.selectedIds.has(item.id!)).length;

  return (
    <div className="animate-fadeIn space-y-6">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-600">
            <Banknote size={16} /> Entradas avulsas
          </p>
          <h3 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Outros Créditos</h3>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            Entradas avulsas, juros, rendimentos e carnês para serviços ou aulas de prática.
          </p>
        </div>
        <div className="flex flex-wrap gap-3"><button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
        >
          <Plus size={16} /> Novo crédito
        </button>
        <button onClick={planModel.openNew} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-emerald-800 hover:bg-emerald-100"><BookOpen size={16} /> Gerar carnê</button>
        <button onClick={model.openPdv} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-800"><QrCode size={18} /> Abrir PDV</button></div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total lançado', value: formatCurrency(kpis.total), color: 'text-[#001a33]' },
          { label: 'Recebido', value: formatCurrency(kpis.recebido), color: 'text-emerald-600' },
          { label: 'A Receber', value: formatCurrency(kpis.aReceber), color: 'text-amber-600' },
          { label: 'Vencidos', value: `${kpis.vencidos}`, color: 'text-rose-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">{kpi.label}</p>
            <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs de status */}
      <FinancialUnderlineTabs
        items={[
          { id: 'pending' as const, label: 'A receber', badge: totals.pending, badgeClassName: 'bg-emerald-50 text-emerald-700' },
          { id: 'received' as const, label: 'Recebidos', badge: totals.received, badgeClassName: 'bg-emerald-50 text-emerald-700' },
          { id: 'canceled' as const, label: 'Cancelados', badge: totals.canceled, badgeClassName: 'bg-emerald-50 text-emerald-700' },
          { id: 'all' as const, label: 'Todos', badge: totals.all, badgeClassName: 'bg-emerald-50 text-emerald-700' },
        ]}
        value={statusScope}
        onChange={setStatusScope}
        ariaLabel="Situação dos outros créditos"
        indicatorClassName="bg-emerald-600"
        activeIconClassName="text-emerald-600"
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Busca */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar descrição, parceiro, CPF, polo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>

        {/* Data Início */}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          title="Vencimento Inicial"
        />

        {/* Data Fim */}
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          title="Vencimento Final"
        />

        {/* Categoria */}
        <select
          value={categoryFilterId}
          onChange={(event) => setCategoryFilterId(event.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.nome}</option>
          ))}
        </select>

        {/* Agrupamento */}
        <select
          value={groupMode}
          onChange={(e) => setGroupMode(e.target.value as OtherCreditGroupMode)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
        >
          <option value="partner">Agrupar por parceiro</option>
          <option value="polo">Agrupar por polo</option>
          <option value="none">Sem agrupamento</option>
        </select>

        {/* Limpar Filtros */}
        {(search || startDate || endDate || categoryFilterId) && (
          <button
            onClick={() => {
              setSearch('');
              setStartDate('');
              setEndDate('');
              setCategoryFilterId('');
            }}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-bold uppercase transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {cancellation.savedAttempts.length > 0 ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div><p className="text-sm font-black text-amber-900">Cancelamentos para conferir</p>
          <p className="mt-1 text-xs text-amber-800">Retome uma operação para confirmar o resultado de todos os seus créditos.</p>
          {cancellation.resumeError ? <p role="alert" className="mt-2 text-sm text-rose-800">{cancellation.resumeError}</p> : null}</div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Operação de cancelamento para retomar" value={cancellation.resumeId || cancellation.savedAttempts[0].idempotencyKey}
            onChange={event => cancellation.setResumeId(event.target.value)} disabled={cancellation.pending}
            className="max-w-full rounded-xl border border-amber-200 bg-white p-3 text-xs font-bold text-amber-900">
            {cancellation.savedAttempts.map(attempt => <option key={attempt.idempotencyKey} value={attempt.idempotencyKey}>
              {attempt.receivableIds.length} crédito(s) · {new Date(attempt.createdAt).toLocaleString('pt-BR')}
            </option>)}
          </select>
          <button type="button" onClick={cancellation.resume} disabled={cancellation.pending || isLoading}
          className="rounded-xl bg-amber-800 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">Retomar cancelamento</button>
        </div>
      </div> : null}

      {cancellation.selectedItems.length > 0 ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div><p className="text-sm font-black text-emerald-900">{cancellation.selectedItems.length} crédito(s) selecionado(s)</p>
          <p className="mt-1 text-xs text-emerald-800">Seleção desta página · até {OTHER_CREDIT_CANCELLATION_LIMIT} créditos por operação</p></div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={cancellation.clear} disabled={cancellation.pending} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Limpar seleção</button>
          <button type="button" onClick={() => cancellation.open()} disabled={cancellation.selectionLocked}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-3 text-xs font-black uppercase text-white hover:bg-rose-800 disabled:opacity-50">
            <XCircle size={16} /> Cancelar selecionados
          </button>
        </div>
      </div> : null}

      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16">
            <Loader2 className="animate-spin text-emerald-600" size={22} />
            <span className="text-sm font-bold text-slate-500">Carregando outros créditos...</span>
          </div>
        ) : totalItems === 0 ? (
          <div className="py-16 text-center">
            <WalletCards className="mx-auto mb-3 text-slate-300" size={34} />
            <p className="text-sm font-black uppercase tracking-wider text-slate-500">Nenhum crédito encontrado</p>
            <p className="mt-1 text-xs font-medium text-slate-400">Ajuste os filtros ou registre uma nova entrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-12 px-4 py-4"><OtherCreditSelectionCheckbox
                    label="Selecionar créditos canceláveis desta página"
                    checked={eligiblePageItems.length > 0 && selectedPageCount === eligiblePageItems.length}
                    mixed={selectedPageCount > 0 && selectedPageCount < eligiblePageItems.length}
                    disabled={cancellation.selectionLocked || !eligiblePageItems.length}
                    onChange={() => cancellation.toggle(visibleItems)} /></th>
                  {['Crédito', 'Parceiro / Polo', 'Vencimento', 'Origem', 'Valor', 'Ações'].map((header) => (
                    <th key={header} className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{header}</th>
                  ))}
                </tr>
              </thead>
              {groupMode === 'none' ? (
                <tbody className="divide-y divide-slate-100">
                  {pageItems.map((item, index) => <OtherCreditRow key={item.id} item={item} index={index} model={model} onOpenPlan={planModel.openPlan} cancellation={cancellation} />)}
                </tbody>
              ) : pageGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.key);
                const summary = getGroupSummary(group.items);
                const first = summary.first;
                const eligibleGroup = selectableOtherCredits(group.items).filter(item => !cancellation.reservedIds.has(item.id!));
                const selectedGroupCount = eligibleGroup.filter(item => cancellation.selectedIds.has(item.id!)).length;

                return (
                  <tbody key={group.key} className="divide-y divide-slate-100">
                    <tr className="bg-slate-50/80 transition-colors hover:bg-emerald-50/65">
                      <td className="w-12 px-4 py-4"><OtherCreditSelectionCheckbox
                        label={`Selecionar créditos canceláveis de ${group.label}`}
                        checked={eligibleGroup.length > 0 && selectedGroupCount === eligibleGroup.length}
                        mixed={selectedGroupCount > 0 && selectedGroupCount < eligibleGroup.length}
                        disabled={cancellation.selectionLocked || !eligibleGroup.length}
                        onChange={() => cancellation.toggle(group.items)} /></td>
                      <td colSpan={6} className="p-0">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          className="grid w-full grid-cols-[minmax(260px,1.5fr)_minmax(160px,0.8fr)_minmax(170px,0.9fr)_minmax(130px,0.7fr)] items-center gap-4 px-5 py-4 text-left"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl ${
                              isExpanded ? 'bg-[#001a33] text-white' : 'bg-white text-slate-500'
                            }`}>
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black text-[#001a33]">{group.label}</span>
                              <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {groupMode === 'partner'
                                  ? first?.clienteCpfCnpj || 'CPF/CNPJ não vinculado'
                                  : `${first?.poloCnpj || 'CNPJ não informado'} · ${first?.poloCidade || 'Cidade não informada'} / ${first?.poloUf || 'UF'}`}
                              </span>
                            </span>
                          </span>

                          <span className="text-xs font-bold text-slate-600">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Lançamentos</span>
                            {group.items.length} crédito(s)
                          </span>

                          <span className="text-xs font-bold text-slate-600">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Situação</span>
                            {summary.pendingCount} pend. · {summary.receivedCount} rec. · {summary.canceledCount} canc.
                          </span>

                          <span className="text-right text-xs font-bold text-slate-600">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Próximo vencimento</span>
                            <span className="text-[10px] text-slate-400">{summary.nextDue ? formatDate(summary.nextDue) : '—'}</span>
                          </span>
                        </button>
                      </td>
                    </tr>
                    {isExpanded && group.items.map((item, index) => <OtherCreditRow key={item.id} item={item} index={index} model={model} onOpenPlan={planModel.openPlan} cancellation={cancellation} />)}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-slate-400">
            {groupMode === 'none'
              ? `Mostrando ${pageItems.length} de ${filtered.length} crédito(s)`
              : `Mostrando ${pageGroups.length} de ${allGroups.length} grupo(s), ${filtered.length} crédito(s)`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage <= 1}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>


      <OtherCreditCreateModal model={model} />
      <OtherCreditPdvModal model={model} />
      <OtherCreditPlanModal model={planModel} resources={model} />
      <OtherCreditCancellationModal model={cancellation} />
      {model.paymentReceivableId && (
        <OtherCreditPaymentModal
          key={model.paymentReceivableId}
          receivableId={model.paymentReceivableId}
          onClose={() => model.setPaymentReceivableId(null)}
          onNewPayment={model.openPdv}
        />
      )}

      {receiveItem && (
        <ManualSettlementModal
          key={receiveItem.id}
          receivable={receiveItem}
          accounts={receiveAccounts}
          initialAccountId={receiveAccounts[0]?.id || ''}
          pending={receiveMutation.isPending}
          error={receiveMutation.error instanceof Error ? receiveMutation.error.message : null}
          onClose={() => {
            if (!receiveMutation.isPending) setReceiveItem(null);
          }}
          onConfirm={(payload) => receiveMutation.mutate(payload)}
        />
      )}
    </div>
  );
};

export default OutrosCreditosTab;
