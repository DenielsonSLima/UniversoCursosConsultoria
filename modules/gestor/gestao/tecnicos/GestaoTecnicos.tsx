
// File: modules/gestor/gestao/tecnicos/GestaoTecnicos.tsx

import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Briefcase, Archive, Activity, Megaphone } from 'lucide-react';
import TurmaCard from '../components/TurmaCard';
import TurmaTecnicoForm from '../components/forms/TurmaTecnicoForm';
import TurmaTecnicoDetalhes from './detalhes/TurmaTecnicoDetalhes';
import { gestaoService } from '../gestao.service';
import { Turma } from '../gestao.types';
import TurmasFilters from '../components/TurmasFilters';
import { useTurmasPaginadas } from '../hooks/useTurmasPaginadas';
import ConfirmModal from '../../components/ConfirmModal';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { invalidateSiteTickerQueries } from '../../../public/siteTicker.keys';
import TechnicalDataError from './detalhes/components/TechnicalDataError';
import { useGestaoCursos } from '../hooks/useGestaoCursos';
import { gestaoQueryKeys } from '../gestao.query-keys';
import { invalidateTechnicalLandingQueries } from '../../../public/landing-pages/cursos-tecnicos/technicalLanding.keys';
import type { GestorPermissions } from '../../access-control';

interface GestaoTecnicosProps {
  onToggleDetails?: React.Dispatch<boolean>;
  poloId?: string;
  creationPoloId?: string;
  permissions: GestorPermissions;
}

const GestaoTecnicos: React.FC<GestaoTecnicosProps> = ({ onToggleDetails, poloId, creationPoloId, permissions }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTurma, setSelectedTurma] = useState<Turma | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Turma | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toasts, removeToast, toast } = useToast();
  const queryClient = useQueryClient();

  const list = useTurmasPaginadas('TECNICO', poloId);
  const cursosQuery = useGestaoCursos('TECNICO');
  const cursosDisponiveis = cursosQuery.data || [];

  useEffect(() => {
    setSelectedTurma(null);
    if (onToggleDetails) onToggleDetails(false);
  }, [onToggleDetails, poloId]);

  useEffect(() => {
    if (!cursosQuery.error) return;
    const error = cursosQuery.error as Error;
    console.error('Erro ao carregar cursos técnicos:', error);
    toast.error('Cursos não carregados', error.message || 'Não foi possível carregar os cursos técnicos.');
  }, [cursosQuery.error, toast]);

  const handleCreate = async (data: any) => {
    const turma = await gestaoService.createTurma(data);
    await Promise.all([
      invalidateSiteTickerQueries(queryClient),
      invalidateTechnicalLandingQueries(queryClient),
    ]);
    try {
      await queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') });
    } catch (error: any) {
      console.error('Turma criada, mas a lista não recarregou:', error);
      toast.error('Lista não atualizada', error?.message || 'A turma foi criada, mas a lista não recarregou automaticamente.');
    }
    toast.success('Turma criada', `${turma.codigo} foi criada como ${turma.status.replaceAll('_', ' ').toLowerCase()}.`);
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
      await Promise.all([
        invalidateSiteTickerQueries(queryClient),
        invalidateTechnicalLandingQueries(queryClient),
      ]);
      await queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') });
      toast.success('Turma excluída', `${deleteTarget.codigo} foi removida com segurança.`);
    } catch (error: any) {
      toast.error('Turma não excluída', error?.message || 'Não foi possível excluir a turma.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Se houver uma turma selecionada, exibe a tela de detalhes
  if (selectedTurma) {
    return (
      <TurmaTecnicoDetalhes 
        turma={selectedTurma} 
        onBack={handleCloseDetails} 
        permissions={permissions}
      />
    );
  }

  return (
    <div className="">
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
          onClick={() => { if (!list.error && !cursosQuery.isError) setIsModalOpen(true); }}
          disabled={Boolean(list.error || cursosQuery.isError || cursosQuery.isPending)}
          title={list.error || cursosQuery.isError ? 'Recarregue os dados antes de criar uma turma.' : 'Abrir nova turma'}
          className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} /> Abrir Nova Turma
        </button>
      </div>

      {/* Abas Internas */}
      <div className="flex gap-4 mb-6 border-b border-slate-100 pb-1 overflow-x-auto">
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
          onClick={() => list.changeStatus('INSCRICOES_ABERTAS')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            list.status === 'INSCRICOES_ABERTAS'
              ? 'text-amber-600 border-b-2 border-amber-600'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Megaphone size={14} /> Inscrições
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
        ) : list.error ? (
          <div className="col-span-full">
            <TechnicalDataError
              title="Turmas técnicas não carregadas"
              message="A lista e a criação foram bloqueadas para não confundir uma falha de consulta com uma categoria vazia."
              onRetry={() => { void list.reload().catch(() => undefined); }}
            />
          </div>
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
                    showDisciplineProgress
                    onDelete={setDeleteTarget}
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
        selectedPoloId={creationPoloId || poloId}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTurma}
        title="Excluir turma"
        message={`Esta ação apaga definitivamente a turma ${deleteTarget?.codigo || ''} e remove matrículas, inscrições e cobranças pendentes pré-início. O banco continuará bloqueando turmas iniciadas, pagamentos confirmados, atividades e histórico acadêmico.`}
        confirmText={isDeleting ? 'Excluindo...' : 'Excluir'}
        cancelText="Voltar"
        variant="danger"
      />

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default GestaoTecnicos;
