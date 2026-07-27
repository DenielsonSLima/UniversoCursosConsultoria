
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, MonitorPlay, Archive, Activity } from 'lucide-react';
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

interface GestaoEadProps {
  onToggleDetails?: (isOpen: boolean) => void;
  permissions: GestorPermissions;
}

const GestaoEad: React.FC<GestaoEadProps> = ({ onToggleDetails, permissions }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTurma, setSelectedTurma] = useState<Turma | null>(null);
  const queryClient = useQueryClient();

  const list = useTurmasPaginadas('EAD');
  const cursosQuery = useGestaoCursos('EAD');
  const cursosDisponiveis = cursosQuery.data || [];

  const handleCreate = async (data: any) => {
    await gestaoService.createTurma(data);
    await invalidateSiteTickerQueries(queryClient);
    await queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('EAD') });
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
    <div className="">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-purple-50/50 p-6 rounded-[2.5rem] border border-purple-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl shadow-sm">
            <MonitorPlay size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Turmas EAD</h3>
            <p className="text-purple-700 text-sm font-medium">Gestão de turmas à distância.</p>
          </div>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          disabled={cursosQuery.isPending || cursosQuery.isError}
          className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-purple-700 transition-colors shadow-lg shadow-purple-900/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} /> Abrir Nova Turma
        </button>
      </div>

      <div className="flex gap-4 mb-6 border-b border-slate-100 pb-1">
        <button 
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
          onClick={() => list.changeStatus('FINALIZADA')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            list.status === 'FINALIZADA'
            ? 'text-slate-800 border-b-2 border-slate-800' 
            : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Archive size={14} /> Finalizadas
        </button>
      </div>

      <TurmasFilters {...list} onSearchChange={list.setSearch} onDataInicialChange={list.setDataInicial}
        onDataFinalChange={list.setDataFinal} onSortByChange={list.changeSortBy}
        onApply={list.applyFilters} onPageChange={list.setPage} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {list.loading ? (
          <div className="col-span-full py-12 text-center text-slate-400">Carregando turmas...</div>
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
