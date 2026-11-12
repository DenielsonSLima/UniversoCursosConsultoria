
import '../components/gestao-catalog-workspace.css';
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Archive, Activity } from 'lucide-react';
import TurmaCard from '../components/TurmaCard';
import TurmaEadForm from '../components/forms/TurmaEadForm';
import { gestaoService } from '../gestao.service';
import TurmasFilters from '../components/TurmasFilters';
import { useTurmasPaginadas } from '../hooks/useTurmasPaginadas';
import { Turma } from '../gestao.types';
import TurmaEadDetalhes from './detalhes/TurmaEadDetalhes';
import { invalidateSiteTickerQueries } from '../../../public/siteTicker.keys';
import { useGestaoCursos } from '../hooks/useGestaoCursos';
import { gestaoQueryKeys } from '../gestao.query-keys';
import type { GestorPermissions } from '../../access-control';
import GestaoDataError from '../components/GestaoDataError';

interface GestaoEadProps {
  onToggleDetails?: (isOpen: boolean) => void;
  permissions: GestorPermissions;
}

const GestaoEad: React.FC<GestaoEadProps> = ({ onToggleDetails, permissions }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTurma, setSelectedTurma] = useState<Turma | null>(null);
  const queryClient = useQueryClient();

  const list = useTurmasPaginadas('EAD', undefined, 12);
  const cursosQuery = useGestaoCursos('EAD');
  const cursosDisponiveis = cursosQuery.data || [];

  const handleCreate = async (data: any) => {
    await gestaoService.createTurma(data);
    await Promise.allSettled([
      invalidateSiteTickerQueries(queryClient),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('EAD') }),
    ]);
  };

  const openTurma = (turma: Turma) => {
    setSelectedTurma(turma);
    onToggleDetails?.(true);
  };

  const closeTurma = () => {
    setSelectedTurma(null);
    onToggleDetails?.(false);
  };

  if (selectedTurma) {
    return <TurmaEadDetalhes turma={selectedTurma} onBack={closeTurma} permissions={permissions} />;
  }

  return (
    <div className="gestao-catalog-workspace gestao-ead-workspace">
      <div className="gestao-ead-toolbar">
        <nav aria-label="Situação das turmas EAD" className="gestao-catalog-statuses flex gap-4 border-b border-slate-100 pb-1">
          <button 
            type="button"
            aria-pressed={list.status === 'EM_ANDAMENTO'}
            onClick={() => list.changeStatus('EM_ANDAMENTO')}
            className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
              list.status === 'EM_ANDAMENTO'
              ? 'text-purple-600 border-b-2 border-purple-600' 
              : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Activity size={14} /> Em Andamento
          </button>
          <button 
            type="button"
            aria-pressed={list.status === 'FINALIZADA'}
            onClick={() => list.changeStatus('FINALIZADA')}
            className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
              list.status === 'FINALIZADA'
              ? 'text-slate-800 border-b-2 border-slate-800' 
              : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Archive size={14} /> Finalizadas
          </button>
        </nav>
        <button
          type="button"
          onClick={() => { if (!list.error && !cursosQuery.isError) setIsModalOpen(true); }}
          disabled={Boolean(list.error || cursosQuery.isPending || cursosQuery.isError)}
          title={list.error || cursosQuery.isError ? 'Recarregue os dados antes de criar uma turma.' : 'Abrir nova turma'}
          className="gestao-ead-create"
        >
          <Plus size={16} aria-hidden="true" /> Abrir nova turma
        </button>
      </div>

      <TurmasFilters {...list} onSearchChange={list.setSearch} onDataInicialChange={list.setDataInicial}
        onDataFinalChange={list.setDataFinal} onSortByChange={list.changeSortBy}
        onApply={list.applyFilters} onPageChange={list.setPage} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {list.loading ? (
          <div className="col-span-full py-12 text-center text-slate-400">Carregando turmas...</div>
        ) : list.error ? (
          <div className="col-span-full">
            <GestaoDataError
              title="Turmas EAD não carregadas"
              message="Não foi possível consultar as turmas. A criação foi bloqueada até que os dados sejam recarregados."
              onRetry={() => { void list.reload().catch(() => undefined); }}
              retrying={list.refreshing}
            />
          </div>
        ) : list.turmas.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400">
                Nenhuma turma encontrada.
            </div>
        ) : (
            list.turmas.map(turma => (
                <TurmaCard
                  key={turma.id}
                  turma={turma}
                  colorTheme="purple"
                  onClick={() => openTurma(turma)}
                />
            ))
        )}
      </div>

      <TurmaEadForm 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        cursosDisponiveis={cursosDisponiveis}
      />
    </div>
  );
};

export default GestaoEad;
