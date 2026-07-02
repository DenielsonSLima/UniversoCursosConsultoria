
import React, { useState, useEffect } from 'react';
import { Plus, Zap, Archive, Activity } from 'lucide-react';
import TurmaCard from '../components/TurmaCard';
import TurmaLivreForm from '../components/forms/TurmaLivreForm';
import TurmaLivreDetalhes from './detalhes/TurmaLivreDetalhes';
import { gestaoService } from '../gestao.service';
import { Turma } from '../gestao.types';
import TurmasFilters from '../components/TurmasFilters';
import { useGestaoLivresTurmas } from './hooks/useGestaoLivresTurmas';
import ConfirmModal from '../../components/ConfirmModal';

interface GestaoLivresProps {
  onToggleDetails?: React.Dispatch<boolean>;
  poloId?: string;
  creationPoloId?: string;
}

const GestaoLivres: React.FC<GestaoLivresProps> = ({ onToggleDetails, poloId, creationPoloId }) => {
  const [cursosDisponiveis, setCursosDisponiveis] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTurma, setSelectedTurma] = useState<Turma | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Turma | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const list = useGestaoLivresTurmas(poloId);

  useEffect(() => {
    setSelectedTurma(null);
    if (onToggleDetails) onToggleDetails(false);
    gestaoService.getCursosByModalidade('LIVRE').then(setCursosDisponiveis);
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

  const handleDeleteTurma = async () => {
    if (!deleteTarget || isDeleting) return;
    try {
      setIsDeleting(true);
      await gestaoService.deleteTurmaNaoIniciada(deleteTarget.id);
      await list.reload();
    } catch (error: any) {
      window.alert(error?.message || 'Nao foi possivel excluir a turma.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (selectedTurma) {
    return (
      <TurmaLivreDetalhes 
        turma={selectedTurma} 
        onBack={handleCloseDetails} 
      />
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-amber-50/50 p-6 rounded-[2.5rem] border border-amber-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl shadow-sm">
            <Zap size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Turmas Cursos Livres</h3>
            <p className="text-amber-700 text-sm font-medium">Gestão de turmas de curta duração.</p>
          </div>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-amber-600 transition-colors shadow-lg shadow-amber-900/20"
        >
          <Plus size={16} /> Abrir Nova Turma
        </button>
      </div>

      <div className="flex gap-4 mb-6 border-b border-slate-100 pb-1">
        <button 
          onClick={() => list.changeStatus('EM_ANDAMENTO')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            list.status === 'EM_ANDAMENTO'
            ? 'text-amber-600 border-b-2 border-amber-600' 
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
                <div key={turma.id} onClick={() => handleSelectTurma(turma)} className="cursor-pointer">
                  <TurmaCard turma={turma} colorTheme="amber" showPoloDetails onDelete={setDeleteTarget} />
                </div>
            ))
        )}
      </div>

      <TurmaLivreForm 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        cursosDisponiveis={cursosDisponiveis}
        selectedPoloId={creationPoloId || poloId}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTurma}
        title="Excluir turma"
        message={`Esta acao apaga a turma ${deleteTarget?.codigo || ''} e remove matriculas, cobrancas, documentos de validacao e vinculos ligados a ela. O banco so bloqueia se a turma ja comecou ou tiver diario, notas, estagio, certificado, fechamento ou movimentacao academica.`}
        confirmText={isDeleting ? 'Excluindo...' : 'Excluir'}
        cancelText="Voltar"
        variant="danger"
      />
    </div>
  );
};

export default GestaoLivres;
