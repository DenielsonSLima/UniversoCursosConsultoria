import React from 'react';
import type { ContaBancaria } from '../../financeiro.service';
import type { DespesaGroupSummary, DespesaLancamento } from '../despesas.service';
import type { DespesaTipo } from '../despesas.queryKeys';
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
    <div className="space-y-3">
      <DespesaSelectionBar
        eligibleItems={deletion.eligibleItems}
        selectedItems={deletion.selectedItems}
        onToggleAll={deletion.selectAll}
        onClear={() => deletion.setSelectedIds(new Set())}
        onDelete={() => deletion.openConfirmation()}
      />

      {agrupar ? (
        <DespesaGroupedView items={items} summaries={summaries} viewMode={viewMode} {...shared} />
      ) : viewMode === 'tabela' ? (
        <DespesaTable items={items} {...shared} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
