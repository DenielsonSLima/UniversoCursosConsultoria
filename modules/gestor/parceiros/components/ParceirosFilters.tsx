
import React from 'react';
import { Search, Filter, Layers, CheckCircle2, MonitorPlay, BookOpenCheck, Stethoscope, Wrench, Users } from 'lucide-react';

export type AlunoModalidadeFilter = 'EAD' | 'LIVRE' | 'ESPECIALIZACAO' | 'TECNICO';

interface ParceirosFiltersProps {
  onSearch: (term: string) => void;
  onSortChange: (sort: string) => void;
  onStatusChange?: (status: string) => void;
  selectedAlunoModalidades?: AlunoModalidadeFilter[];
  onToggleAlunoModalidade?: (modalidade: AlunoModalidadeFilter) => void;
  onClearAlunoModalidades?: () => void;
  onTurmaChange?: (turma: string) => void;
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
  onTurmaChange
}) => {
  const hasAlunoModalidadeFilter = selectedAlunoModalidades.length > 0;

  return (
    <div className="space-y-4 mb-10 w-full">
      <div className="flex flex-col md:flex-row gap-4 w-full">
      
      {/* Campo de Busca Estilizado */}
      <div className="flex-[2] relative group">
        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
          <Search size={22} />
        </div>
        <input 
          type="text" 
          placeholder="Pesquisar por nome, CNPJ, CPF ou cidade..." 
          className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-slate-700 font-medium shadow-sm transition-all placeholder:text-slate-400"
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-col md:flex-row flex-[3] gap-3">
          {/* Status */}
          <div className="relative group flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-600 z-10 pointer-events-none">
              <CheckCircle2 size={18} />
            </div>
            <select 
              className="w-full appearance-none bg-white pl-11 pr-10 py-4 border border-slate-200 rounded-2xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-slate-700 font-bold text-sm cursor-pointer shadow-sm relative z-0"
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
              <Layers size={18} />
            </div>
            <select 
              className="w-full appearance-none bg-white pl-11 pr-10 py-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-slate-700 font-bold text-sm cursor-pointer shadow-sm relative z-0"
              onChange={(e) => onTurmaChange && onTurmaChange(e.target.value)}
            >
              <option value="todas">Todas Turmas</option>
              <option value="t1">Turma A - 2024</option>
              <option value="t2">Turma B - 2024</option>
              <option value="t3">Intensivo Fds</option>
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
              <Filter size={18} />
            </div>
            <select 
              className="w-full appearance-none bg-white pl-11 pr-10 py-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-slate-700 font-bold text-sm cursor-pointer shadow-sm relative z-0"
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

      <div className="rounded-[1.5rem] border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Filtro de alunos</p>
            <p className="mt-1 text-[11px] font-bold text-slate-500">
              Selecione uma ou mais modalidades para listar alunos vinculados. Ex.: EAD + Técnico.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClearAlunoModalidades}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                !hasAlunoModalidadeFilter
                  ? 'border-[#001a33] bg-[#001a33] text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
              title="Mostrar todos os alunos"
            >
              <Users size={14} />
              Todos os alunos
            </button>
            {alunoModalidadeOptions.map(({ id, label, icon: Icon }) => {
              const active = selectedAlunoModalidades.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggleAlunoModalidade?.(id)}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-900/15'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                  title={`Filtrar alunos de ${label}`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
};

export default ParceirosFilters;
