
import React, { useState, useEffect } from 'react';
import { Plus, Award, Archive, Activity } from 'lucide-react';
import TurmaCard from '../components/TurmaCard';
import TurmaEspecializacaoForm from '../components/forms/TurmaEspecializacaoForm';
import { gestaoService } from '../gestao.service';
import { Turma } from '../gestao.types';
import { cursosEspecializacaoService } from '../../cadastros/cursos-especializacao/cursos-especializacao.service';

const GestaoEspecializacao: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'andamento' | 'finalizadas'>('andamento');
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [cursosDisponiveis, setCursosDisponiveis] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const turmasData = await gestaoService.getTurmasByModalidade('ESPECIALIZACAO');
    setTurmas(turmasData);
    const cursosData = await gestaoService.getCursosByModalidade('ESPECIALIZACAO');
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
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-rose-50/50 p-6 rounded-[2.5rem] border border-rose-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shadow-sm">
            <Award size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Turmas Especialização</h3>
            <p className="text-rose-700 text-sm font-medium">Gestão de turmas de pós-técnico.</p>
          </div>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-rose-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-rose-700 transition-colors shadow-lg shadow-rose-900/20"
        >
          <Plus size={16} /> Abrir Nova Turma
        </button>
      </div>

      <div className="flex gap-4 mb-6 border-b border-slate-100 pb-1">
        <button 
          onClick={() => setActiveSubTab('andamento')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'andamento' 
            ? 'text-rose-600 border-b-2 border-rose-600' 
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
                <TurmaCard key={turma.id} turma={turma} colorTheme="rose" />
            ))
        )}
      </div>

      <TurmaEspecializacaoForm 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        cursosDisponiveis={cursosDisponiveis}
      />
    </div>
  );
};

export default GestaoEspecializacao;
