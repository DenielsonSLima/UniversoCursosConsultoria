
// File: modules/gestor/parceiros/components/detalhes/aluno/ParceiroAlunoDetalhes.tsx

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileBadge } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ParceiroAlunoDados from './ParceiroAlunoDados';
import ParceiroAlunoCursos from './ParceiroAlunoCursos';
import ParceiroAlunoMatriculas from './ParceiroAlunoMatriculas';
import ParceiroAlunoDocumentos from './ParceiroAlunoDocumentos';
import ParceiroAlunoFinanceiro from './ParceiroAlunoFinanceiro';
import ParceiroAcesso from '../shared/ParceiroAcesso';
import FichaAlunoModal from './ficha/FichaAlunoModal';
import ParceiroAlunoSecretaria from './ParceiroAlunoSecretaria';
import ParceiroAlunoVacinas from './ParceiroAlunoVacinas';
import { parceirosService } from '../../../parceiros.service';
import { formatMatricula } from '../../../../../../lib/academicUtils';
import { supabase } from '../../../../../../lib/supabase';
import ToastNotification, { useToast } from '../../shared/ToastNotification';
import ParceiroAlunoNavigation, { alunoTabs, type AlunoTab } from './ParceiroAlunoNavigation';
import AlunoDiscardChangesDialog from './AlunoDiscardChangesDialog';

interface ParceiroAlunoDetalhesProps {
  alunoInicial: any;
  onBack: () => void;
  onRequestScrollTop?: () => void;
}

const ParceiroAlunoDetalhes: React.FC<ParceiroAlunoDetalhesProps> = ({ alunoInicial, onBack, onRequestScrollTop }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<AlunoTab>('dados');
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<AlunoTab | 'back' | null>(null);
  const [isFichaOpen, setIsFichaOpen] = useState(false);
  const scrollTopRef = useRef(onRequestScrollTop);

  useEffect(() => {
    scrollTopRef.current = onRequestScrollTop;
  }, [onRequestScrollTop]);

  useEffect(() => {
    setActiveTab('dados');
    setIsEditing(false);
    setIsDirty(false);
    setIsSaving(false);
    setPendingDestination(null);
    scrollTopRef.current?.();
  }, [alunoInicial.id]);

  // Carregar dados reais usando React Query com initialData do parceiro selecionado
  const { data: alunoData = alunoInicial } = useQuery({
    queryKey: ['parceiro', alunoInicial.id],
    queryFn: () => parceirosService.getById(alunoInicial.id),
    initialData: alunoInicial,
  });

  const { data: currentEnrollment } = useQuery<any | null>({
    queryKey: ['parceiro', alunoInicial.id, 'matricula-atual'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select('id, status, data_matricula, turmas(nome, cursos(nome))')
        .eq('aluno_id', alunoInicial.id)
        .order('data_matricula', { ascending: false });
      if (error) throw error;
      return (data || []).find((item) => item.status === 'ATIVO') || data?.[0] || null;
    },
    staleTime: 15_000,
  });
  const currentEnrollmentTurma = Array.isArray(currentEnrollment?.turmas)
    ? currentEnrollment.turmas[0]
    : currentEnrollment?.turmas;
  const currentEnrollmentCurso = Array.isArray(currentEnrollmentTurma?.cursos)
    ? currentEnrollmentTurma.cursos[0]
    : currentEnrollmentTurma?.cursos;

  const updateMutation = useMutation({
    mutationFn: (newData: any) => parceirosService.update(alunoData.id, newData),
    onSuccess: (updated) => {
      queryClient.setQueryData(['parceiro', alunoData.id], updated);
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      toast.success('Aluno atualizado', `${updated.nome || alunoData.nome} teve os dados salvos com sucesso.`, {
        avatarUrl: updated.foto || alunoData.foto,
        avatarName: updated.nome || alunoData.nome,
        contextLabel: 'Cadastro do aluno',
      });
    },
    onError: (err: any) => {
      toast.error('Aluno não atualizado', err?.message || 'Revise os dados e tente salvar novamente.', {
        avatarUrl: alunoData.foto,
        avatarName: alunoData.nome,
        contextLabel: 'Cadastro do aluno',
      });
      console.error(err);
    }
  });

  const handleDataChange = async (newData: any) => {
    return updateMutation.mutateAsync(newData);
  };

  const handlePhotoUploaded = (fotoUrl: string) => {
    const updatedAluno = { ...alunoData, foto: fotoUrl };
    queryClient.setQueryData(['parceiro', alunoData.id], (cached: any) => ({ ...(cached || alunoData), foto: fotoUrl }));
    queryClient.invalidateQueries({ queryKey: ['parceiros'] });
    toast.success('Foto do aluno atualizada', `${updatedAluno.nome || 'Aluno'} agora tem uma foto de perfil no cadastro.`, {
      avatarUrl: fotoUrl,
      avatarName: updatedAluno.nome,
      contextLabel: 'Perfil do aluno',
    });
  };

  const handlePhotoUploadError = (message: string) => {
    toast.error('Foto não enviada', message, {
      avatarUrl: alunoData.foto,
      avatarName: alunoData.nome,
      contextLabel: 'Perfil do aluno',
    });
  };

  const navigate = (destination: AlunoTab | 'back') => {
    setPendingDestination(null);
    setIsDirty(false);
    setIsEditing(false);
    if (destination === 'back') {
      onBack();
      return;
    }
    setActiveTab(destination);
    onRequestScrollTop?.();
  };

  const requestNavigation = (destination: AlunoTab | 'back') => {
    if (isSaving || updateMutation.isPending || destination === activeTab) return;
    if (isDirty) {
      setPendingDestination(destination);
      return;
    }
    navigate(destination);
  };

  const currentAreaLabel = alunoTabs.find((tab) => tab.id === activeTab)?.label;
  const navigationDisabled = isSaving || updateMutation.isPending;

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 pt-5 sm:px-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <button type="button" aria-label="Voltar para parceiros" disabled={navigationDisabled}
                onClick={() => requestNavigation('back')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 outline-none hover:bg-slate-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="break-words text-[22px] font-semibold leading-7 tracking-tight text-[#001a33]">{alunoData.nome}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-slate-600">
                  {currentEnrollment ? <>
                    <span>Matrícula {formatMatricula(currentEnrollment.id, currentEnrollment.data_matricula, alunoData.polo_id)}</span>
                    <span className={`rounded-full px-2 py-0.5 font-medium ${currentEnrollment.status === 'ATIVO' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                      Vínculo {currentEnrollment.status}
                    </span>
                  </> : <span>Sem matrícula acadêmica · Cadastro {alunoData.status || 'ATIVO'}</span>}
                  {isEditing && <span className="text-blue-700">Editando cadastro{isDirty ? ' · alterações pendentes' : ''}</span>}
                </div>
                {currentEnrollment && <p className="mt-1 text-xs leading-5 text-slate-600">
                  {currentEnrollmentCurso?.nome || 'Curso não informado'} · Turma {currentEnrollmentTurma?.nome || 'não informada'}
                </p>}
              </div>
            </div>
            <button type="button" onClick={() => setIsFichaOpen(true)}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500">
              <FileBadge size={16} aria-hidden="true" /> Imprimir ficha
            </button>
          </div>
          <ParceiroAlunoNavigation activeTab={activeTab} disabled={navigationDisabled} onSelect={requestNavigation} />
        </header>
        <section id={`aluno-panel-${activeTab}`} role="tabpanel" aria-label={currentAreaLabel}
          tabIndex={0} className="p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-6">
        {activeTab === 'dados' && (
            <ParceiroAlunoDados 
                aluno={alunoData} 
                onChange={handleDataChange} 
                onPhotoUploaded={handlePhotoUploaded}
                onPhotoUploadError={handlePhotoUploadError}
                onEditingChange={setIsEditing}
                onDirtyChange={setIsDirty}
                onSavingChange={setIsSaving}
            />
        )}
        {activeTab === 'cursos' && (
            <ParceiroAlunoCursos alunoId={alunoData.id} />
        )}
        {activeTab === 'matriculas' && (
            <ParceiroAlunoMatriculas alunoId={alunoData.id} />
        )}
        {activeTab === 'docs' && (
          <ParceiroAlunoDocumentos alunoId={alunoData.id} toast={toast} />
        )}
        {activeTab === 'vacinas' && <ParceiroAlunoVacinas alunoId={alunoData.id} />}
        {activeTab === 'financeiro' && <ParceiroAlunoFinanceiro alunoId={alunoData.id} />}
        {activeTab === 'secretaria' && <ParceiroAlunoSecretaria alunoId={alunoData.id} />}
        {activeTab === 'acesso' && (
          <ParceiroAcesso
            parceiroId={alunoData.id}
            tipo="Aluno"
            email={alunoData.email || null}
            matriculaAcesso={alunoData.matriculaAcesso || null}
            acessoStatus={alunoData.acessoStatus || null}
            acessoErro={alunoData.acessoErro || null}
            trocaSenhaObrigatoria={alunoData.trocaSenhaObrigatoria ?? null}
            aceitouTermosUso={alunoData.aceitouTermosUso ?? null}
            termosUsoVersao={alunoData.termosUsoVersao ?? null}
            toast={toast}
          />
        )}
        </section>
      </div>

      {pendingDestination && <AlunoDiscardChangesDialog
        onKeepEditing={() => setPendingDestination(null)}
        onDiscard={() => navigate(pendingDestination)}
      />}

      {isFichaOpen && (
        <FichaAlunoModal 
          aluno={alunoData}
          onClose={() => setIsFichaOpen(false)}
        />
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />

    </div>
  );
};

export default ParceiroAlunoDetalhes;
