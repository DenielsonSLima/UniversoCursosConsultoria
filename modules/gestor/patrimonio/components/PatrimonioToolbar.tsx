import { ChevronDown, FileOutput, LayoutGrid, LayoutList, Plus, Search, Tag } from 'lucide-react';
import type { PatrimonioProductType } from '../patrimonio-product-types.service';
import type { PatrimonioStatusFilter, PatrimonioViewMode } from '../patrimonio.types';

interface PatrimonioToolbarProps {
  search: string;
  tipoProduto: string;
  status: PatrimonioStatusFilter;
  productTypes: PatrimonioProductType[];
  areProductTypesLoading?: boolean;
  viewMode: PatrimonioViewMode;
  canViewDeleted?: boolean;
  isDisabled?: boolean;
  onSearchChange: (value: string) => void;
  onTipoProdutoChange: (value: string) => void;
  onStatusChange: (value: PatrimonioStatusFilter) => void;
  onViewModeChange: (value: PatrimonioViewMode) => void;
  onExport: () => void;
  onCreate: () => void;
}

export function PatrimonioToolbar({
  search,
  tipoProduto,
  status,
  productTypes,
  areProductTypesLoading = false,
  viewMode,
  canViewDeleted = false,
  isDisabled = false,
  onSearchChange,
  onTipoProdutoChange,
  onStatusChange,
  onViewModeChange,
  onExport,
  onCreate,
}: PatrimonioToolbarProps) {
  const statusTabs: Array<{
    value: Extract<PatrimonioStatusFilter, 'ativos' | 'baixados' | 'excluidos'>;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
  }> = [
    { value: 'ativos', label: 'Ativos' },
    { value: 'baixados', label: 'Baixados' },
    {
      value: 'excluidos',
      label: 'Excluídos',
      disabled: !canViewDeleted,
      disabledReason: 'Somente o gestor global pode consultar patrimônios excluídos.',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            disabled={isDisabled}
            placeholder="Buscar por descrição, tipo ou nº de série..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Buscar patrimônios"
          />
        </div>

        <label className={`flex min-w-[210px] items-center rounded-xl border border-slate-200 bg-slate-50 transition-all focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 ${
          isDisabled || areProductTypesLoading ? 'cursor-not-allowed opacity-50' : ''
        }`}>
          <Tag size={13} className="ml-3 shrink-0 text-slate-400" aria-hidden="true" />
          <select
            value={tipoProduto}
            onChange={(event) => onTipoProdutoChange(event.target.value)}
            disabled={isDisabled || areProductTypesLoading}
            className="min-w-0 flex-1 appearance-none bg-transparent py-2.5 pl-2 pr-1 text-xs font-semibold text-slate-700 outline-none disabled:cursor-not-allowed"
            aria-label="Filtrar por tipo de produto"
          >
            <option value="">{areProductTypesLoading ? 'Carregando tipos...' : 'Todos os tipos'}</option>
            {productTypes
              .filter((productType) => productType.status === 'ativo' || productType.usageCount > 0)
              .map((productType) => (
              <option key={productType.id || productType.nome} value={productType.id}>
                {productType.nome}{productType.status === 'inativo' ? ' (inativo)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={15} className="mr-3 shrink-0 text-slate-400" aria-hidden="true" />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Modo de visualização">
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExport}
              disabled={isDisabled}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileOutput size={15} />
              Exportar
            </button>

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
      </div>

      <nav className="overflow-x-auto border-b border-slate-200" aria-label="Situação do patrimônio">
        <div className="-mb-px flex min-w-max items-center gap-1" role="group">
          {statusTabs.map((tab) => {
            const isActive = status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => onStatusChange(tab.value)}
                disabled={isDisabled || tab.disabled}
                title={tab.disabledReason}
                aria-pressed={isActive}
                className={`inline-flex min-h-11 items-center border-b-2 px-4 text-xs font-black uppercase tracking-wide transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-700'
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
