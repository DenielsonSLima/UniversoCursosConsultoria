import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import React from 'react';
import { Search } from 'lucide-react';
import { DOCUMENT_TABS } from '../historico-emissoes.constants';
import type { CursoEmissionFilter, TurmaFilter } from '../historico-emissoes.types';

const modalidadeLabels: Record<string, string> = {
  TECNICO: 'Técnico', LIVRE: 'Livre', ESPECIALIZACAO: 'Especialização',
  EAD: 'Educação a Distância (EAD)', SUPERIOR: 'Ensino Superior',
};

interface Props {
  activeTab: string;
  searchQuery: string;
  selectedTurmaId: string;
  turmas: TurmaFilter[];
  selectedModalidade: string;
  selectedCursoId: string;
  cursos: CursoEmissionFilter[];
  modalidades: string[];
  filtersLoading: boolean;
  filtersError: string;
  onTabChange: (tab: string) => void;
  onSearchChange: (search: string) => void;
  onTurmaChange: (turmaId: string) => void;
  onModalidadeChange: (modalidade: string) => void;
  onCursoChange: (cursoId: string) => void;
  onSearch: () => void;
}

const EmissionsToolbar: React.FC<Props> = ({
  activeTab,
  searchQuery,
  selectedTurmaId,
  turmas,
  selectedModalidade, selectedCursoId, cursos, modalidades, filtersLoading, filtersError,
  onTabChange,
  onSearchChange,
  onTurmaChange,
  onModalidadeChange, onCursoChange,
  onSearch,
}) => (
  <>
    <form onSubmit={(event) => { event.preventDefault(); onSearch(); }}
      aria-label="Filtros do histórico de emissões"
      className="grid grid-cols-1 items-center gap-3 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(180px,1.2fr)_minmax(180px,1.2fr)_auto]">
      <div className="relative min-w-0 w-full">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Buscar por nome do aluno, CPF ou código validador..."
          aria-label="Buscar emissões por nome, CPF ou código"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
        />
      </div>
      <InstitutionalSelect
        ariaLabel="Filtrar emissões por modalidade"
        value={selectedModalidade} onValueChange={onModalidadeChange}
        loading={filtersLoading} error={filtersError}
        options={[{ value: 'todos', label: 'Modalidade (todas)' },
          ...modalidades.map(value => ({ value, label: modalidadeLabels[value] || value }))]}
        className="min-w-0 w-full"
      />
      <InstitutionalSelect
        ariaLabel="Filtrar emissões por curso"
        value={selectedCursoId} onValueChange={onCursoChange}
        loading={filtersLoading} error={filtersError}
        options={[{ value: 'todos', label: 'Curso (todos)' },
          ...cursos.map(curso => ({ value: curso.id, label: curso.nome }))]}
        className="min-w-0 w-full"
      />
        <div className="min-w-0 w-full">
          <InstitutionalSelect
            ariaLabel="Filtrar emissões por turma"
            value={selectedTurmaId}
            onValueChange={onTurmaChange}
            loading={filtersLoading} error={filtersError}
            options={[{ value: 'todos', label: 'Filtrar por turma (todas)' }, ...turmas.map((turma) => ({ value: turma.id, label: `${turma.nome} (${turma.codigo})` }))]}
            className="w-full"
          />
        </div>
        <button
          type="submit"
          className="rounded-2xl bg-[#001a33] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-900"
        >
          Filtrar
        </button>
    </form>

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
