import { LayoutGrid, Search, Table2, X } from 'lucide-react';

export type DependenciasViewMode = 'table' | 'cards';

interface FilterOption {
  value: string;
  label: string;
}

interface DependenciasFiltersProps {
  search: string;
  modalidade: string;
  curso: string;
  turma: string;
  modalidades: FilterOption[];
  cursos: FilterOption[];
  turmas: FilterOption[];
  viewMode: DependenciasViewMode;
  hasFilters: boolean;
  onSearchChange: (value: string) => void;
  onModalidadeChange: (value: string) => void;
  onCursoChange: (value: string) => void;
  onTurmaChange: (value: string) => void;
  onViewModeChange: (value: DependenciasViewMode) => void;
  onClear: () => void;
}

const selectClassName = 'h-11 min-w-[150px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50';

const DependenciasFilters = ({
  search,
  modalidade,
  curso,
  turma,
  modalidades,
  cursos,
  turmas,
  viewMode,
  hasFilters,
  onSearchChange,
  onModalidadeChange,
  onCursoChange,
  onTurmaChange,
  onViewModeChange,
  onClear,
}: DependenciasFiltersProps) => (
  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
    <label className="relative min-w-[240px] flex-1">
      <span className="sr-only">Buscar dependências</span>
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Aluno, disciplina, curso ou turma..."
        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </label>

    <label>
      <span className="sr-only">Filtrar por modalidade</span>
      <select
        aria-label="Filtrar por modalidade"
        value={modalidade}
        onChange={(event) => onModalidadeChange(event.target.value)}
        className={selectClassName}
      >
        <option value="">Todas as modalidades</option>
        {modalidades.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>

    <label>
      <span className="sr-only">Filtrar por curso</span>
      <select
        aria-label="Filtrar por curso"
        value={curso}
        disabled={!cursos.length}
        onChange={(event) => onCursoChange(event.target.value)}
        className={selectClassName}
      >
        <option value="">Todos os cursos</option>
        {cursos.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>

    <label>
      <span className="sr-only">Filtrar por turma</span>
      <select
        aria-label="Filtrar por turma"
        value={turma}
        disabled={!turmas.length}
        onChange={(event) => onTurmaChange(event.target.value)}
        className={selectClassName}
      >
        <option value="">Todas as turmas</option>
        {turmas.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>

    {hasFilters ? (
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-[10px] font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-200"
      >
        <X size={13} /> Limpar
      </button>
    ) : null}

    <div className="ml-auto flex gap-1 rounded-xl bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => onViewModeChange('table')}
        aria-label="Visualizar como tabela"
        aria-pressed={viewMode === 'table'}
        title="Tabela"
        className={`rounded-lg p-2 transition ${
          viewMode === 'table'
            ? 'bg-white text-blue-600 shadow-sm'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <Table2 size={15} />
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange('cards')}
        aria-label="Visualizar como cards"
        aria-pressed={viewMode === 'cards'}
        title="Cards"
        className={`rounded-lg p-2 transition ${
          viewMode === 'cards'
            ? 'bg-white text-blue-600 shadow-sm'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <LayoutGrid size={15} />
      </button>
    </div>
  </div>
);

export default DependenciasFilters;
