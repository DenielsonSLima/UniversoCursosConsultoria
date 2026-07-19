
import React from 'react';
import { Search, Filter, Layers, CheckCircle2, MonitorPlay, BookOpenCheck, Stethoscope, Wrench, Users } from 'lucide-react';
import type { ParceirosTabType } from '../hooks/useParceirosFilters';

export type AlunoModalidadeFilter = 'EAD' | 'LIVRE' | 'ESPECIALIZACAO' | 'TECNICO';

interface ParceirosFiltersProps {
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

  return (
    <div className="space-y-3 mb-6 w-full">
      <div className="flex flex-col md:flex-row gap-3 w-full">
      
        {/* Campo de Busca Estilizado */}
        <div className="flex-[2] relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="Pesquisar por nome, CNPJ, CPF ou cidade..." 
            className="w-full pl-11 pr-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-slate-700 font-medium text-sm shadow-sm transition-all placeholder:text-slate-400"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-col md:flex-row flex-[3] gap-3">
          {/* Status */}
          <div className="relative group flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-600 z-10 pointer-events-none">
              <CheckCircle2 size={16} />
            </div>
            <select 
              aria-label="Filtrar parceiros por status"
              className="w-full appearance-none bg-white pl-11 pr-10 py-3 border border-slate-200 rounded-2xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-slate-700 font-bold text-sm cursor-pointer shadow-sm relative z-0"
              onChange={(e) => onStatusChange && onStatusChange(e.target.value)}
            >
              <option value="todos">Todos Status</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1L5 5L9 1" />
              </svg>
            </div>
          </div>

          {/* Turmas */}
          <div className="relative group flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 z-10 pointer-events-none">
              <Layers size={16} />
            </div>
            <select 
              aria-label="Filtrar parceiros por turma"
              className="w-full appearance-none bg-white pl-11 pr-10 py-3 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-slate-700 font-bold text-sm cursor-pointer shadow-sm relative z-0"
              value={selectedTurma}
              disabled={loadingTurmas || turmasError}
              onChange={(e) => onTurmaChange && onTurmaChange(e.target.value)}
            >
              <option value="todas">
                {turmasError ? 'Turmas indisponíveis' : (loadingTurmas ? 'Carregando turmas...' : 'Todas as turmas')}
              </option>
              {!loadingTurmas && !turmasError && turmas.length === 0 && (
                <option value="" disabled>Nenhuma turma em andamento</option>
              )}
              {turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {turma.nome || turma.cursoNome || turma.codigo || 'Turma sem nome'}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1L5 5L9 1" />
              </svg>
            </div>
          </div>

          {/* Ordenação */}
          <div className="relative group flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 z-10 pointer-events-none">
              <Filter size={16} />
            </div>
            <select 
              aria-label="Ordenar parceiros"
              className="w-full appearance-none bg-white pl-11 pr-10 py-3 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-slate-700 font-bold text-sm cursor-pointer shadow-sm relative z-0"
              onChange={(e) => onSortChange(e.target.value)}
            >
              <option value="az">A - Z</option>
              <option value="za">Z - A</option>
              <option value="recent">Recente</option>
              <option value="oldest">Antigo</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1L5 5L9 1" />
              </svg>
            </div>
          </div>
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

