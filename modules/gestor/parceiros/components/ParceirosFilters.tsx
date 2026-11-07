
import React from 'react';
import { Search, MonitorPlay, BookOpenCheck, Stethoscope, Wrench, Users, X } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import './partner-filters.css';
import type { ParceirosTabType } from '../hooks/useParceirosFilters';

export type AlunoModalidadeFilter = 'EAD' | 'LIVRE' | 'ESPECIALIZACAO' | 'TECNICO';

interface ParceirosFiltersProps {
  searchTerm: string;
  statusFilter: string;
  sortOrder: string;
  onSearch: (term: string) => void;
  onSortChange: (sort: string) => void;
  onStatusChange?: (status: string) => void;
  selectedAlunoModalidades?: AlunoModalidadeFilter[];
  onToggleAlunoModalidade?: (modalidade: AlunoModalidadeFilter) => void;
  onClearAlunoModalidades?: () => void;
  onTurmaChange?: (turma: string) => void;
  selectedTurma?: string;
  turmas?: Array<{ id: string; nome?: string; codigo?: string; cursoNome?: string }>;
  loadingTurmas?: boolean;
  turmasError?: boolean;
  onRetryTurmas?: () => void;
  activeTab?: ParceirosTabType;
}

const alunoModalidadeOptions = [
  { id: 'EAD' as const, label: 'EAD', icon: MonitorPlay },
  { id: 'LIVRE' as const, label: 'Livres', icon: Wrench },
  { id: 'ESPECIALIZACAO' as const, label: 'Especialização', icon: Stethoscope },
  { id: 'TECNICO' as const, label: 'Técnico', icon: BookOpenCheck },
];

const ParceirosFilters: React.FC<ParceirosFiltersProps> = ({ 
  searchTerm,
  statusFilter,
  sortOrder,
  onSearch, 
  onSortChange,
  onStatusChange,
  selectedAlunoModalidades = [],
  onToggleAlunoModalidade,
  onClearAlunoModalidades,
  onTurmaChange,
  selectedTurma = 'todas',
  turmas = [],
  loadingTurmas = false,
  turmasError = false,
  onRetryTurmas,
  activeTab = 'todos',
}) => {
  const hasAlunoModalidadeFilter = selectedAlunoModalidades.length > 0;
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const clearSearch = () => {
    onSearch('');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  return (
    <div className="partner-filters space-y-3 mb-5 w-full">
      <div className="flex flex-col md:flex-row gap-3 w-full">
      
        {/* Campo de Busca Estilizado */}
        <div className="flex-[2] relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
            <Search size={18} />
          </div>
          <input 
            ref={searchInputRef}
            type="text"
            aria-label="Buscar parceiros"
            placeholder="Pesquisar por nome, CNPJ, CPF ou cidade..." 
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-sm font-medium text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              aria-label="Limpar busca"
              title="Limpar busca"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="partner-filter-selects">
          <InstitutionalSelect
            ariaLabel="Filtrar parceiros por status"
            value={statusFilter}
            onValueChange={(value) => onStatusChange?.(value)}
            options={[
              { value: 'todos', label: 'Todos os status' },
              { value: 'ativo', label: 'Ativos' },
              { value: 'inativo', label: 'Inativos' },
            ]}
          />
          <InstitutionalSelect
            ariaLabel="Filtrar parceiros por turma"
            value={selectedTurma}
            onValueChange={(value) => onTurmaChange?.(value)}
            disabled={loadingTurmas || turmasError}
            loading={loadingTurmas}
            error={turmasError ? 'Não foi possível carregar as turmas.' : undefined}
            options={[
              { value: 'todas', label: 'Todas as turmas' },
              ...(!loadingTurmas && !turmasError && turmas.length === 0
                ? [{ value: '', label: 'Nenhuma turma em andamento', disabled: true }] : []),
              ...turmas.map((turma) => ({
                value: turma.id,
                label: turma.nome || turma.cursoNome || turma.codigo || 'Turma sem nome',
                keywords: [turma.codigo, turma.cursoNome].filter(Boolean).join(' '),
              })),
            ]}
          />
          <InstitutionalSelect
            ariaLabel="Ordenar parceiros"
            value={sortOrder}
            onValueChange={onSortChange}
            options={[
              { value: 'az', label: 'A - Z' }, { value: 'za', label: 'Z - A' },
              { value: 'recent', label: 'Recente' }, { value: 'oldest', label: 'Antigo' },
            ]}
          />
        </div>
      </div>

      {turmasError && (
        <div className="flex justify-end">
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
            <span>Não foi possível carregar as turmas reais.</span>
            <button
              type="button"
              onClick={onRetryTurmas}
              className="font-black uppercase tracking-wider text-red-700 underline underline-offset-2 hover:text-red-900"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Filtro de Modalidade Inline e Minimalista para Alunos */}
      {(activeTab === 'todos' || activeTab === 'alunos') && (
        <div className="flex flex-wrap items-center gap-2 mt-2 px-3 py-2 bg-slate-50 rounded-2xl border border-slate-100/50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">Modalidade:</span>
          <button
            type="button"
            onClick={onClearAlunoModalidades}
            className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              !hasAlunoModalidadeFilter
                ? 'border-[#001a33] bg-[#001a33] text-white shadow-sm shadow-[#001a33]/10'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
            title="Mostrar todos os alunos"
          >
            <Users size={12} />
            Todos os alunos
          </button>
          {alunoModalidadeOptions.map(({ id, label, icon: Icon }) => {
            const active = selectedAlunoModalidades.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggleAlunoModalidade?.(id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-900/15'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
                title={`Filtrar alunos de ${label}`}
              >
                <Icon size={12} />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ParceirosFilters;
