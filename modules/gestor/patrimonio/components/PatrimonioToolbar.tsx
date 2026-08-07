import { LayoutGrid, LayoutList, Plus, Search, Tag } from 'lucide-react';
import { PATRIMONIO_TIPO_OPTIONS } from '../patrimonio.constants';
import type { PatrimonioViewMode } from '../patrimonio.types';

interface PatrimonioToolbarProps {
  search: string;
  tipoProduto: string;
  viewMode: PatrimonioViewMode;
  isDisabled?: boolean;
  onSearchChange: (value: string) => void;
  onTipoProdutoChange: (value: string) => void;
  onViewModeChange: (value: PatrimonioViewMode) => void;
  onCreate: () => void;
}

export function PatrimonioToolbar({
  search,
  tipoProduto,
  viewMode,
  isDisabled = false,
  onSearchChange,
  onTipoProdutoChange,
  onViewModeChange,
  onCreate,
}: PatrimonioToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por descrição, tipo ou nº de série..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          aria-label="Buscar patrimônios"
        />
      </div>

      <div className="relative min-w-[190px]">
        <Tag size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          list="patrimonio-tipos"
          value={tipoProduto}
          onChange={(event) => onTipoProdutoChange(event.target.value)}
          placeholder="Todos os tipos"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-xs font-semibold text-slate-700 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          aria-label="Filtrar por tipo de produto"
        />
        <datalist id="patrimonio-tipos">
          {PATRIMONIO_TIPO_OPTIONS.map((option) => <option key={option} value={option} />)}
        </datalist>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Modo de visualização">
          <button
            type="button"
            onClick={() => onViewModeChange('tabela')}
            className={`rounded-lg p-2 transition-all ${viewMode === 'tabela' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
            title="Visualizar como tabela"
            aria-label="Visualizar como tabela"
            aria-pressed={viewMode === 'tabela'}
          >
            <LayoutList size={16} />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('cards')}
            className={`rounded-lg p-2 transition-all ${viewMode === 'cards' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
            title="Visualizar como cards"
            aria-label="Visualizar como cards"
            aria-pressed={viewMode === 'cards'}
          >
            <LayoutGrid size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={onCreate}
          disabled={isDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-blue-950/15 transition-all hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} />
          Novo patrimônio
        </button>
      </div>
    </div>
  );
}
