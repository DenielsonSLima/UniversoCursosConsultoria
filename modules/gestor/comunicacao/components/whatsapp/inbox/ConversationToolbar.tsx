import React from 'react';
import { CheckSquare2, Search, Send, Square, Trash2 } from 'lucide-react';

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
}) => (
  <div className="space-y-3 border-b border-slate-100 p-4">
    <div>
      <h3 className="text-base font-bold text-[#001a33]">Conversas</h3>
      <p className="text-xs font-medium text-slate-400">Caixa de entrada WhatsApp</p>
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleAll}
        disabled={selectableCount === 0}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors disabled:opacity-40 ${allSelected || selectedCount > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
        title={allSelected ? 'Limpar seleção' : 'Selecionar todas as conversas filtradas'}
        aria-label={allSelected ? 'Limpar seleção' : 'Selecionar conversas'}
      >
        {allSelected ? <CheckSquare2 size={18} /> : <Square size={18} />}
      </button>
      <label className="relative min-w-0 flex-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar conversa..."
          className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-200 focus:bg-white"
        />
      </label>
    </div>

    {selectedCount > 0 && (
      <div className="flex items-center gap-2">
        <span className="mr-auto text-[11px] font-bold text-slate-500">{selectedCount} selecionada(s)</span>
        <button
          type="button"
          onClick={onBatchSend}
          disabled={sendableCount === 0}
          className="flex h-8 items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40"
          title="Enviar mensagem em lote"
        >
          <Send size={13} /> Mensagem
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="flex h-8 items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
          title="Apagar conversas selecionadas"
        >
          <Trash2 size={13} /> {deleting ? 'Apagando...' : 'Apagar'}
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
