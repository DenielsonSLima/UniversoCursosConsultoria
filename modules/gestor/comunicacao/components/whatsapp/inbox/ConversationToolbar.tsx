import React from 'react';
import { ListChecks, Search, Send, Trash2, X } from 'lucide-react';

export type ConversationStatusFilter = 'aberta' | 'arquivada';

interface ConversationToolbarProps {
  search: string;
  statusFilter: ConversationStatusFilter;
  allSelected: boolean;
  selectedCount: number;
  sendableCount: number;
  selectableCount: number;
  openCount: number;
  closedCount: number;
  deleting: boolean;
  onStatusFilterChange: (value: ConversationStatusFilter) => void;
  onToggleAll: () => void;
  onSearchChange: (value: string) => void;
  onBatchSend: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

const ConversationToolbar: React.FC<ConversationToolbarProps> = ({
  search,
  statusFilter,
  allSelected,
  selectedCount,
  sendableCount,
  selectableCount,
  openCount,
  closedCount,
  deleting,
  onStatusFilterChange,
  onToggleAll,
  onSearchChange,
  onBatchSend,
  onDelete,
  onClearSelection,
}) => (
  <div className="space-y-3 border-b border-slate-100 p-4">
    {selectedCount > 0 ? (
      <div className="flex h-11 items-center gap-1 rounded-xl bg-[#f0f2f5] px-1.5">
        <button
          type="button"
          onClick={onClearSelection}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#54656f] transition-colors hover:bg-[#dfe3e5]"
          title="Cancelar seleção"
          aria-label="Cancelar seleção de conversas"
        >
          <X size={19} />
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-[13px] font-medium text-[#3b4a54]">
          {selectedCount} selecionada{selectedCount === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          disabled={selectableCount === 0}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            allSelected ? 'bg-[#d9fdd3] text-[#008069]' : 'text-[#54656f] hover:bg-[#dfe3e5]'
          }`}
          title={allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
          aria-label={allSelected ? 'Desmarcar todas as conversas' : 'Selecionar todas as conversas'}
        >
          <ListChecks size={18} />
        </button>
        <button
          type="button"
          onClick={onBatchSend}
          disabled={sendableCount === 0}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#008069] transition-colors hover:bg-[#d9fdd3] disabled:opacity-40"
          title="Enviar mensagem em lote"
          aria-label="Enviar mensagem para as conversas selecionadas"
        >
          <Send size={18} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#d93025] transition-colors hover:bg-[#fde7e5] disabled:opacity-50"
          title="Apagar conversas selecionadas"
          aria-label={deleting ? 'Apagando conversas' : 'Apagar conversas selecionadas'}
        >
          <Trash2 size={18} />
        </button>
      </div>
    ) : (
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#667781]" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar conversa..."
          className="h-11 w-full rounded-xl border border-transparent bg-[#f0f2f5] pl-10 pr-12 text-sm font-normal text-[#111b21] outline-none transition-colors placeholder:text-[#667781] focus:border-[#d5dade] focus:bg-white"
        />
        <button
          type="button"
          onClick={onToggleAll}
          disabled={selectableCount === 0}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#667781] transition-colors hover:bg-[#dfe3e5] hover:text-[#008069] disabled:opacity-30"
          title="Selecionar várias conversas"
          aria-label="Selecionar várias conversas"
        >
          <ListChecks size={17} />
        </button>
      </div>
    )}

    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-1">
      <button type="button" onClick={() => onStatusFilterChange('aberta')} className={`rounded-xl px-3 py-2 text-center text-xs font-bold transition-colors ${statusFilter === 'aberta' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
        Abertas <span className="ml-1 text-slate-400">{openCount}</span>
      </button>
      <button type="button" onClick={() => onStatusFilterChange('arquivada')} className={`rounded-xl px-3 py-2 text-center text-xs font-bold transition-colors ${statusFilter === 'arquivada' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
        Finalizadas <span className="ml-1 text-slate-400">{closedCount}</span>
      </button>
    </div>
  </div>
);

export default ConversationToolbar;
