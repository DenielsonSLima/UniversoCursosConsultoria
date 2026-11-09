import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { ContaBancaria } from '../../financeiro.service';
import type { DespesaGroupSummary, DespesaLancamento } from '../despesas.service';
import type { DespesaTipo, DespesaAgrupamento } from '../despesas.queryKeys';
import { useDespesaPendingDeletion } from '../hooks/useDespesaPendingDeletion';
import DespesaCard from './DespesaCard';
import DespesaDeleteModal from './DespesaDeleteModal';
import DespesaGroupedView from './DespesaGroupedView';
import DespesaSelectionBar from './DespesaSelectionBar';
import DespesaTable from './DespesaTable';

interface DespesaListWorkspaceProps {
  items: DespesaLancamento[];
  summaries: DespesaGroupSummary[];
  viewMode: 'tabela' | 'cards';
  agrupar: boolean;
  groupBy?: DespesaAgrupamento;
  groupSummaryLoading?: boolean;
  groupSummaryError?: boolean;
  contas: ContaBancaria[];
  poloId: string;
  tipo: DespesaTipo;
  onPagar: (item: DespesaLancamento) => void;
  onEditar: (item: DespesaLancamento) => void;
  onCancelar: (item: DespesaLancamento) => void;
  onImprimir: (item: DespesaLancamento) => void;
  onAnexo: (item: DespesaLancamento) => void;
  onDeleted: (quantidade: number) => void;
  onDeleteError: (message: string) => void;
}

const DespesaListWorkspace: React.FC<DespesaListWorkspaceProps> = ({
  items,
  summaries,
  viewMode,
  agrupar,
  groupBy = 'categoria',
  groupSummaryLoading = false,
  groupSummaryError = false,
  contas,
  poloId,
  tipo,
  onPagar,
  onEditar,
  onCancelar,
  onImprimir,
  onAnexo,
  onDeleted,
  onDeleteError,
}) => {
  const deletion = useDespesaPendingDeletion({
    items,
    poloId,
    tipo,
    onSuccess: onDeleted,
    onError: onDeleteError,
  });

  const toggleItem = (item: DespesaLancamento, selected: boolean) => {
    const next = new Set(deletion.selectedIds);
    if (selected) next.add(item.id); else next.delete(item.id);
    deletion.setSelectedIds(next);
  };

  const shared = {
    contas,
    onPagar,
    onEditar,
    onCancelar,
    onExcluir: deletion.openConfirmation,
    onImprimir,
    onAnexo,
    selectedIds: deletion.selectedIds,
    onSelectionChange: deletion.setSelectedIds,
  };

  return (
    <div className="space-y-3" aria-busy={groupSummaryLoading || undefined}>
      <DespesaSelectionBar
        eligibleItems={deletion.eligibleItems}
        selectedItems={deletion.selectedItems}
        onToggleAll={deletion.selectAll}
        onClear={() => deletion.setSelectedIds(new Set())}
        onDelete={() => deletion.openConfirmation()}
      />

      {agrupar && groupSummaryLoading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <RefreshCw size={20} className="animate-spin text-rose-500" />Carregando agrupamento…
        </div>
      ) : agrupar && groupSummaryError ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-5 text-sm text-rose-700">
          Não foi possível carregar os totais do agrupamento selecionado.
        </div>
      ) : agrupar ? (
        <DespesaGroupedView key={groupBy} groupBy={groupBy} items={items} summaries={summaries} viewMode={viewMode} {...shared} />
      ) : viewMode === 'tabela' ? (
        <DespesaTable items={items} {...shared} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <DespesaCard
              key={item.id}
              item={item}
              contas={contas}
              onPagar={onPagar}
              onEditar={onEditar}
              onCancelar={onCancelar}
              onExcluir={deletion.openConfirmation}
              onImprimir={onImprimir}
              onAnexo={onAnexo}
              selected={deletion.selectedIds.has(item.id)}
              onSelectionChange={toggleItem}
            />
          ))}
        </div>
      )}

      <DespesaDeleteModal
        items={deletion.pendingItems}
        onConfirm={deletion.confirm}
        onClose={deletion.closeConfirmation}
        isPending={deletion.isPending}
      />
    </div>
  );
};

export default DespesaListWorkspace;
