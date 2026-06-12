
// File: modules/gestor/gestao/tecnicos/GestaoTecnicos.tsx

import React, { useState, useEffect } from 'react';
import { Plus, Briefcase, Archive, Activity } from 'lucide-react';
import TurmaCard from '../components/TurmaCard';
import TurmaTecnicoForm from '../components/forms/TurmaTecnicoForm';
import TurmaTecnicoDetalhes from './detalhes/TurmaTecnicoDetalhes';
import { gestaoService } from '../gestao.service';
import { Turma } from '../gestao.types';
import { cursosTecnicosService } from '../../cadastros/cursos-tecnicos/cursos-tecnicos.service';

interface GestaoTecnicosProps {
  onToggleDetails?: (isOpen: boolean) => void;
}

const GestaoTecnicos: React.FC<GestaoTecnicosProps> = ({ onToggleDetails }) => {
  const [activeSubTab, setActiveSubTab] = useState<'andamento' | 'finalizadas'>('andamento');
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [cursosDisponiveis, setCursosDisponiveis] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTurma, setSelectedTurma] = useState<Turma | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const turmasData = await gestaoService.getTurmasByModalidade('TECNICO');
    setTurmas(turmasData);
    const cursosData = await gestaoService.getCursosByModalidade('TECNICO');
    setCursosDisponiveis(cursosData);
  };

  const handleCreate = async (data: any) => {
    await gestaoService.createTurma(data);
    await loadData();
  };

  const handleSelectTurma = (turma: Turma) => {
    setSelectedTurma(turma);
    if (onToggleDetails) onToggleDetails(true);
  };

  const handleCloseDetails = () => {
    setSelectedTurma(null);
    if (onToggleDetails) onToggleDetails(false);
  };

  const filteredTurmas = turmas.filter(t => 
    activeSubTab === 'andamento' ? t.status === 'EM_ANDAMENTO' : t.status === 'FINALIZADA'
  );

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
          onClick={() => setActiveSubTab('andamento')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'andamento' 
            ? 'text-emerald-600 border-b-2 border-emerald-600' 
            : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Activity size={14} /> Em Andamento
        </button>
        <button 
          onClick={() => setActiveSubTab('finalizadas')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'finalizadas' 
            ? 'text-slate-800 border-b-2 border-slate-800' 
            : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Archive size={14} /> Finalizadas
        </button>
      </div>

      {/* Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredTurmas.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400">
                Nenhuma turma encontrada nesta categoria.
            </div>
        ) : (
            filteredTurmas.map(turma => (
                <div key={turma.id} onClick={() => handleSelectTurma(turma)} className="cursor-pointer">
                  <TurmaCard turma={turma} colorTheme="emerald" />
                </div>
            ))
        )}
      </div>

      <TurmaTecnicoForm 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        cursosDisponiveis={cursosDisponiveis}
      />
    </div>
  );
};

export default GestaoTecnicos;
