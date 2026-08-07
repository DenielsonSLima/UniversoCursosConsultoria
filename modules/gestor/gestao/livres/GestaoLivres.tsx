
import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Zap, Archive, Activity } from 'lucide-react';
import TurmaCard from '../components/TurmaCard';
import TurmaLivreForm from '../components/forms/TurmaLivreForm';
import TurmaLivreDetalhes from './detalhes/TurmaLivreDetalhes';
import { gestaoService } from '../gestao.service';
import { Turma } from '../gestao.types';
import TurmasFilters from '../components/TurmasFilters';
import { useGestaoLivresTurmas } from './hooks/useGestaoLivresTurmas';
import ConfirmModal from '../../components/ConfirmModal';
import { invalidateSiteTickerQueries } from '../../../public/siteTicker.keys';
import { useGestaoCursos } from '../hooks/useGestaoCursos';
import { gestaoQueryKeys } from '../gestao.query-keys';
import type { GestorPermissions } from '../../access-control';
import GestaoDataError from '../components/GestaoDataError';

interface GestaoLivresProps {
  onToggleDetails?: React.Dispatch<boolean>;
  poloId?: string;
  creationPoloId?: string;
  permissions: GestorPermissions;
}

const GestaoLivres: React.FC<GestaoLivresProps> = ({ onToggleDetails, poloId, creationPoloId, permissions }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTurma, setSelectedTurma] = useState<Turma | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Turma | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const list = useGestaoLivresTurmas(poloId);
  const cursosQuery = useGestaoCursos('LIVRE');
  const cursosDisponiveis = cursosQuery.data || [];

  useEffect(() => {
    setSelectedTurma(null);
    if (onToggleDetails) onToggleDetails(false);
  }, [onToggleDetails, poloId]);

  const handleCreate = async (data: any) => {
    await gestaoService.createTurma(data);
    await Promise.allSettled([
      invalidateSiteTickerQueries(queryClient),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('LIVRE') }),
    ]);
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
      await invalidateSiteTickerQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('LIVRE') });
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
        permissions={permissions}
      />
    );
  }

  return (
    <div className="">
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
          onClick={() => { if (!list.error && !cursosQuery.isError) setIsModalOpen(true); }}
          disabled={Boolean(list.error || cursosQuery.isPending || cursosQuery.isError)}
          title={list.error || cursosQuery.isError ? 'Recarregue os dados antes de criar uma turma.' : 'Abrir nova turma'}
          className="flex items-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-amber-600 transition-colors shadow-lg shadow-amber-900/20 disabled:cursor-not-allowed disabled:opacity-40"
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
        ) : list.error ? (
          <div className="col-span-full">
            <GestaoDataError
              title="Turmas livres não carregadas"
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
                <div key={turma.id} onClick={() => handleSelectTurma(turma)} className="cursor-pointer">
                  <TurmaCard turma={turma} colorTheme="amber" onDelete={setDeleteTarget} />
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
