import React, { useEffect, useRef } from 'react';
import { CheckSquare2, Trash2, X } from 'lucide-react';
import type { DespesaLancamento } from '../despesas.service';
import { formatDespesaCurrency } from './despesaPresentation';

interface DespesaSelectionBarProps {
  eligibleItems: DespesaLancamento[];
  selectedItems: DespesaLancamento[];
  onToggleAll: () => void;
  onClear: () => void;
  onDelete: () => void;
}

const DespesaSelectionBar: React.FC<DespesaSelectionBarProps> = ({
  eligibleItems,
  selectedItems,
  onToggleAll,
  onClear,
  onDelete,
}) => {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const allSelected = eligibleItems.length > 0 && selectedItems.length === eligibleItems.length;
  const partiallySelected = selectedItems.length > 0 && !allSelected;
  const total = selectedItems.reduce((sum, item) => sum + item.valor, 0);

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  if (eligibleItems.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
      selectedItems.length > 0
        ? 'border-rose-200 bg-rose-50/70 shadow-sm'
        : 'border-slate-200 bg-white'
    }`}>
      <label className="flex cursor-pointer items-center gap-3 text-xs font-bold text-slate-700">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 rounded border-slate-300 accent-rose-600"
        />
        <CheckSquare2 size={16} className="text-rose-600" />
        {selectedItems.length > 0
          ? `${selectedItems.length} selecionado${selectedItems.length === 1 ? '' : 's'} · ${formatDespesaCurrency(total)}`
          : `Selecionar lançamentos em aberto (${eligibleItems.length})`}
      </label>

      {selectedItems.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-500 transition-colors hover:bg-white"
          >
            <X size={13} /> Limpar
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            <Trash2 size={14} /> Excluir selecionados
          </button>
        </div>
      )}
    </div>
  );
};

export default DespesaSelectionBar;
