
import React from 'react';
import { Search, Filter, Layers, CheckCircle2, BookOpen } from 'lucide-react';

interface ParceirosFiltersProps {
  onSearch: (term: string) => void;
  onSortChange: (sort: string) => void;
  onStatusChange?: (status: string) => void;
  onCursoChange?: (curso: string) => void;
  onTurmaChange?: (turma: string) => void;
}

const ParceirosFilters: React.FC<ParceirosFiltersProps> = ({ 
  onSearch, 
  onSortChange,
  onStatusChange,
  onCursoChange,
  onTurmaChange
}) => {
  return (
    <div className="flex flex-col md:flex-row gap-4 mb-10 w-full">
      
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

          {/* Cursos */}
          <div className="relative group flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-600 z-10 pointer-events-none">
              <BookOpen size={18} />
            </div>
            <select 
              className="w-full appearance-none bg-white pl-11 pr-10 py-4 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 font-bold text-sm cursor-pointer shadow-sm relative z-0"
              onChange={(e) => onCursoChange && onCursoChange(e.target.value)}
            >
              <option value="todos">Todos Cursos</option>
              <option value="c1">Engenharia</option>
              <option value="c2">Administração</option>
              <option value="c3">Direito</option>
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
  );
};

export default ParceirosFilters;
