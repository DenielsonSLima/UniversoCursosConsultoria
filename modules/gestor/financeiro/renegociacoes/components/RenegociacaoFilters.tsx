import React from 'react';
import type {
  RenegociacaoCandidateFilters,
  RenegociacaoFilterOptions,
  RenegociacaoLifecycleStatus,
  RenegociacaoView,
} from '../renegociacoes.types';
import RenegociacaoFilterPicker from './RenegociacaoFilterPicker';
import { RenegociacaoSearch } from './RenegociacaoPanels';

interface RenegociacaoFiltersProps {
  view: RenegociacaoView;
  ongoingStatus: Extract<RenegociacaoLifecycleStatus, 'DRAFT' | 'PROPOSED'>;
  search: string;
  filters: RenegociacaoCandidateFilters;
  filterOptions?: RenegociacaoFilterOptions;
  loading: boolean;
  error: boolean;
  onStatus: (status: Extract<RenegociacaoLifecycleStatus, 'DRAFT' | 'PROPOSED'>) => void;
  onSearch: (value: string) => void;
  onFilters: (filters: RenegociacaoCandidateFilters) => void;
  onRetry: () => void;
}

const RenegociacaoFilters: React.FC<RenegociacaoFiltersProps> = ({
  view, ongoingStatus, search, filters, filterOptions, loading, error,
  onStatus, onSearch, onFilters, onRetry,
}) => (
  <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
    {view === 'EM_ANDAMENTO' ? (
      <div className="flex gap-2" role="group" aria-label="Situação das propostas">
        {([
          ['PROPOSED', 'Propostas'], ['DRAFT', 'Rascunhos'],
        ] as const).map(([status, label]) => (
          <button
            key={status}
            type="button"
            aria-pressed={ongoingStatus === status}
            onClick={() => onStatus(status)}
            className={`min-h-10 rounded-xl border px-3 text-xs font-bold ${ongoingStatus === status ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'}`}
          >
            {label}
          </button>
        ))}
      </div>
    ) : null}
    <div className={`grid gap-3 ${view === 'A_NEGOCIAR' ? 'items-end lg:grid-cols-[minmax(16rem,2fr)_minmax(12rem,1fr)_minmax(14rem,1fr)]' : ''}`}>
      <RenegociacaoSearch
        value={search}
        onChange={onSearch}
        placeholder={view === 'A_NEGOCIAR' ? 'Buscar aluno, matrícula ou turma...' : 'Buscar proposta por aluno ou turma...'}
      />
      {view === 'A_NEGOCIAR' ? (
        <>
          <RenegociacaoFilterPicker
            label="Tipo de curso"
            value={filters.courseType}
            options={[{ id: '', label: 'Todos os tipos' }, ...(filterOptions?.courseTypes || [])]}
            loading={loading}
            error={error}
            onRetry={onRetry}
            onChange={(courseType) => onFilters({ courseType: courseType as RenegociacaoCandidateFilters['courseType'], turmaId: '' })}
          />
          <RenegociacaoFilterPicker
            label="Turma"
            value={filters.turmaId}
            options={[
              { id: '', label: 'Todas as turmas' },
              ...(filterOptions?.turmas || []).filter((turma) => !filters.courseType || turma.courseType === filters.courseType),
            ]}
            loading={loading}
            error={error}
            onRetry={onRetry}
            onChange={(turmaId) => onFilters({ ...filters, turmaId })}
          />
        </>
      ) : null}
    </div>
  </div>
);

export default RenegociacaoFilters;
