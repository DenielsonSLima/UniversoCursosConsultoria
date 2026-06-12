
import React, { useState, useEffect } from 'react';
import { Plus, MonitorPlay, Archive, Activity } from 'lucide-react';
import TurmaCard from '../components/TurmaCard';
import TurmaEadForm from '../components/forms/TurmaEadForm';
import { gestaoService } from '../gestao.service';
import { Turma } from '../gestao.types';

const GestaoEad: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'andamento' | 'finalizadas'>('andamento');
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [cursosDisponiveis, setCursosDisponiveis] = useState<any[]>([]); // Mock temporário
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const turmasData = await gestaoService.getTurmasByModalidade('EAD');
    setTurmas(turmasData);
    const cursosData = await gestaoService.getCursosByModalidade('EAD');
    setCursosDisponiveis(cursosData);
  };

  const handleCreate = async (data: any) => {
    await gestaoService.createTurma(data);
    await loadData();
  };

  const filteredTurmas = turmas.filter(t => 
    activeSubTab === 'andamento' ? t.status === 'EM_ANDAMENTO' : t.status === 'FINALIZADA'
  );

  return (
    <div className="animate-fadeIn">
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
          className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-purple-700 transition-colors shadow-lg shadow-purple-900/20"
        >
          <Plus size={16} /> Abrir Nova Turma
        </button>
      </div>

      <div className="flex gap-4 mb-6 border-b border-slate-100 pb-1">
        <button 
          onClick={() => setActiveSubTab('andamento')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'andamento' 
            ? 'text-purple-600 border-b-2 border-purple-600' 
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredTurmas.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400">
                Nenhuma turma encontrada.
            </div>
        ) : (
            filteredTurmas.map(turma => (
                <TurmaCard key={turma.id} turma={turma} colorTheme="purple" />
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
