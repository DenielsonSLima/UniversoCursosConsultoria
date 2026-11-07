import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import React from 'react';
import { Search } from 'lucide-react';
import { DOCUMENT_TABS } from '../historico-emissoes.constants';
import type { TurmaFilter } from '../historico-emissoes.types';

interface Props {
  activeTab: string;
  searchQuery: string;
  selectedTurmaId: string;
  turmas: TurmaFilter[];
  onTabChange: (tab: string) => void;
  onSearchChange: (search: string) => void;
  onTurmaChange: (turmaId: string) => void;
  onSearch: () => void;
}

const EmissionsToolbar: React.FC<Props> = ({
  activeTab,
  searchQuery,
  selectedTurmaId,
  turmas,
  onTabChange,
  onSearchChange,
  onTurmaChange,
  onSearch,
}) => (
  <>
    <div className="flex flex-col items-center justify-between gap-4 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm md:flex-row">
      <div className="relative w-full flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Buscar por nome do aluno, CPF ou código validador..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && onSearch()}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
        />
      </div>
      <div className="flex w-full shrink-0 gap-3 md:w-auto">
        <div className="min-w-0 flex-1 md:flex-initial">
          <InstitutionalSelect
            ariaLabel="Filtrar emissões por turma"
            value={selectedTurmaId}
            onValueChange={onTurmaChange}
            options={[{ value: 'todos', label: 'Filtrar por turma (todas)' }, ...turmas.map((turma) => ({ value: turma.id, label: `${turma.nome} (${turma.codigo})` }))]}
            className="w-full md:min-w-[220px]"
          />
        </div>
        <button
          onClick={onSearch}
          className="rounded-2xl bg-[#001a33] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-900"
        >
          Filtrar
        </button>
      </div>
    </div>

    <div data-secretaria-modes className="flex flex-wrap gap-1 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
      {DOCUMENT_TABS.map((tab) => {
        const TabIcon = tab.icon;
        const selected = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            aria-pressed={selected}
            onClick={() => onTabChange(tab.key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all ${
              selected
                ? 'bg-[#001a33] text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <TabIcon size={12} />
            {tab.label}
          </button>
        );
      })}
    </div>
  </>
);

export default EmissionsToolbar;
