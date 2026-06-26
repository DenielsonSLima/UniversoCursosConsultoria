
// File: modules/gestor/gestao/tecnicos/GestaoTecnicos.tsx

import React, { useState, useEffect } from 'react';
import { Plus, Briefcase, Archive, Activity } from 'lucide-react';
import TurmaCard from '../components/TurmaCard';
import TurmaTecnicoForm from '../components/forms/TurmaTecnicoForm';
import TurmaTecnicoDetalhes from './detalhes/TurmaTecnicoDetalhes';
import { gestaoService } from '../gestao.service';
import { Turma } from '../gestao.types';
import TurmasFilters from '../components/TurmasFilters';
import { useTurmasPaginadas } from '../hooks/useTurmasPaginadas';

interface GestaoTecnicosProps {
  onToggleDetails?: (isOpen: boolean) => void;
  poloId?: string;
}

const GestaoTecnicos: React.FC<GestaoTecnicosProps> = ({ onToggleDetails, poloId }) => {
  const [cursosDisponiveis, setCursosDisponiveis] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTurma, setSelectedTurma] = useState<Turma | null>(null);

  const list = useTurmasPaginadas('TECNICO', poloId);

  useEffect(() => {
    setSelectedTurma(null);
    if (onToggleDetails) onToggleDetails(false);
    gestaoService.getCursosByModalidade('TECNICO').then(setCursosDisponiveis);
  }, [poloId]);

  const handleCreate = async (data: any) => {
    await gestaoService.createTurma(data);
    await list.reload();
  };

  const handleSelectTurma = (turma: Turma) => {
    setSelectedTurma(turma);
    if (onToggleDetails) onToggleDetails(true);
  };

  const handleCloseDetails = () => {
    setSelectedTurma(null);
    if (onToggleDetails) onToggleDetails(false);
  };

  // Se houver uma turma selecionada, exibe a tela de detalhes
  if (selectedTurma) {
    return (
      <TurmaTecnicoDetalhes 
        turma={selectedTurma} 
        onBack={handleCloseDetails} 
      />
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Sub-Header Específico */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-emerald-50/50 p-6 rounded-[2.5rem] border border-emerald-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl shadow-sm">
            <Briefcase size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Turmas Técnicas</h3>
            <p className="text-emerald-700 text-sm font-medium">Gestão de turmas de cursos profissionalizantes.</p>
          </div>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/20"
        >
          <Plus size={16} /> Abrir Nova Turma
        </button>
      </div>

      {/* Abas Internas */}
      <div className="flex gap-4 mb-6 border-b border-slate-100 pb-1">
        <button 
          onClick={() => list.changeStatus('EM_ANDAMENTO')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            list.status === 'EM_ANDAMENTO'
            ? 'text-emerald-600 border-b-2 border-emerald-600' 
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

      {/* Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {list.loading ? (
          <div className="col-span-full py-12 text-center text-slate-400">Carregando turmas...</div>
        ) : list.turmas.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400">
                Nenhuma turma encontrada nesta categoria.
            </div>
        ) : (
            list.turmas.map(turma => (
                <div key={turma.id} onClick={() => handleSelectTurma(turma)} className="cursor-pointer">
                  <TurmaCard
                    turma={turma}
                    colorTheme="emerald"
                    showPoloDetails
                    showDisciplineProgress
                  />
                </div>
            ))
        )}
      </div>

      <TurmaTecnicoForm 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        cursosDisponiveis={cursosDisponiveis}
        selectedPoloId={poloId}
      />
    </div>
  );
};

export default GestaoTecnicos;
