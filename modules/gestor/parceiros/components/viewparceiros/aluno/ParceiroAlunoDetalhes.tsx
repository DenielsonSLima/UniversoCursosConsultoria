
// File: modules/gestor/parceiros/components/detalhes/aluno/ParceiroAlunoDetalhes.tsx

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ParceiroAlunoDados from './ParceiroAlunoDados';
import ParceiroAlunoCursos from './ParceiroAlunoCursos';
import ParceiroAlunoMatriculas from './ParceiroAlunoMatriculas';
import ParceiroAlunoDocumentos from './ParceiroAlunoDocumentos';
import ParceiroAlunoFinanceiro from './ParceiroAlunoFinanceiro';
import ParceiroAcesso from '../shared/ParceiroAcesso';
import { refreshStudentAccess, type StudentAccessRefreshStatus } from '../shared/student-access-refresh';
import { portalActivationService } from '../../../portal-activation.service';
import ParceiroAlunoSecretaria from './ParceiroAlunoSecretaria';
import ParceiroAlunoVacinas from './ParceiroAlunoVacinas';
import { parceirosService } from '../../../parceiros.service';
import { academicosService } from '../../../../configuracoes/academicos/academicos.service';
import { formatAcademicEnrollment, selectPrimaryEnrollment } from '../../../utils/aluno-primary-enrollment';
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
  const [accessRefreshAttempt, setAccessRefreshAttempt] = useState(0);
  const [accessRefresh, setAccessRefresh] = useState<{ partnerId: string; status: StudentAccessRefreshStatus }>({ partnerId: alunoInicial.id, status: 'idle' });
  const [hydratedCadastroId, setHydratedCadastroId] = useState<string | null>(null);
  const scrollTopRef = useRef(onRequestScrollTop);

  useEffect(() => {
    scrollTopRef.current = onRequestScrollTop;
  }, [onRequestScrollTop]);

  useEffect(() => {
    setActiveTab('dados');
    setIsEditing(false);
    setIsDirty(false);
    setIsSaving(false);
    setHydratedCadastroId(null);
    setPendingDestination(null);
    scrollTopRef.current?.();
  }, [alunoInicial.id]);

  // O resumo da busca serve ao cabeçalho, nunca como base de edição.
  const alunoQuery = useQuery({
    queryKey: ['parceiro', alunoInicial.id],
    queryFn: async () => {
      const aluno = await parceirosService.getById(alunoInicial.id);
      if (aluno?.id !== alunoInicial.id || aluno?.tipo !== 'Aluno') {
        throw new Error('O cadastro retornado não corresponde ao aluno selecionado.');
      }
      return aluno;
    },
    placeholderData: alunoInicial,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const alunoData = alunoQuery.data || alunoInicial;
  const cadastroReady = hydratedCadastroId === alunoInicial.id
    && alunoData.id === alunoInicial.id && alunoData.tipo === 'Aluno';

  useEffect(() => {
    if (alunoQuery.isSuccess && alunoQuery.isFetchedAfterMount && !alunoQuery.isPlaceholderData
      && !alunoQuery.isFetching && alunoData.id === alunoInicial.id && alunoData.tipo === 'Aluno') {
      setHydratedCadastroId(alunoInicial.id);
    }
  }, [alunoInicial.id, alunoData.id, alunoData.tipo, alunoQuery.isSuccess, alunoQuery.isFetchedAfterMount,
    alunoQuery.isPlaceholderData, alunoQuery.isFetching]);

  useEffect(() => {
    if (activeTab !== 'acesso') return;
    let cancelled = false;
    const controller = new AbortController();
    const partnerId = alunoInicial.id;
    setAccessRefresh({ partnerId, status: 'loading' });
    void refreshStudentAccess(queryClient, partnerId, {
      getPartner: () => parceirosService.getById(partnerId),
      getEmailStatus: async () => {
        const [status] = await portalActivationService.getPartnerEmailStatuses([partnerId]);
        return status || null;
      },
    }, controller.signal).then(() => {
      if (!cancelled) setAccessRefresh({ partnerId, status: 'ready' });
    }).catch(() => {
      if (!cancelled) setAccessRefresh({ partnerId, status: 'error' });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [activeTab, alunoInicial.id, accessRefreshAttempt, queryClient]);

  const retryAccessRefresh = () => {
    setAccessRefresh({ partnerId: alunoInicial.id, status: 'idle' });
    setAccessRefreshAttempt((attempt) => attempt + 1);
  };

  const { data: currentEnrollment, isPending: isLoadingEnrollment, isError: enrollmentError } = useQuery<any | null>({
    queryKey: ['parceiro', alunoInicial.id, 'matricula-atual'],
    queryFn: async () => {
      const [{ data, error }, academicConfig] = await Promise.all([
        supabase
          .from('matriculas')
          .select('id, status, data_matricula, turmas(nome, polo_id, cursos(nome))')
          .eq('aluno_id', alunoInicial.id),
        academicosService.getConfigsStrict(),
      ]);
      if (error) throw error;
      const enrollment = selectPrimaryEnrollment(data || []);
      return enrollment ? {
        ...enrollment,
        numero: formatAcademicEnrollment(enrollment, academicConfig),
      } : null;
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
    mutationFn: async (newData: any) => {
      if (!cadastroReady) throw new Error('Aguarde o carregamento completo do cadastro antes de salvar.');
      if (newData?.id !== alunoInicial.id) throw new Error('O rascunho não corresponde ao aluno selecionado.');
      const updated = await parceirosService.update(alunoInicial.id, newData);
      if (updated?.id !== alunoInicial.id || updated?.tipo !== 'Aluno') {
        throw new Error('A resposta da atualização não corresponde ao aluno selecionado.');
      }
      return updated;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['parceiro', updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      toast.success('Aluno atualizado', `${updated.nome || 'Aluno'} teve os dados salvos com sucesso.`, {
        avatarUrl: updated.foto,
        avatarName: updated.nome,
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
    if (destination === 'acesso') setAccessRefresh({ partnerId: alunoInicial.id, status: 'idle' });
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
                  {isLoadingEnrollment ? <span>Carregando matrícula...</span> : enrollmentError ? <span>Matrícula indisponível</span> : currentEnrollment ? <>
                    <span>Matrícula {currentEnrollment.numero}</span>
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
          </div>
          <ParceiroAlunoNavigation activeTab={activeTab} disabled={navigationDisabled} onSelect={requestNavigation} />
        </header>
        <section id={`aluno-panel-${activeTab}`} role="tabpanel" aria-label={currentAreaLabel}
          tabIndex={0} className="p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-6">
        {activeTab === 'dados' && !cadastroReady && (alunoQuery.isError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>Não foi possível carregar o cadastro completo do aluno.</p>
            <button type="button" onClick={() => { void alunoQuery.refetch(); }}
              className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-red-200 px-4 font-medium hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500">
              Tentar novamente
            </button>
          </div>
        ) : <p role="status" className="py-6 text-sm text-slate-500">Carregando cadastro completo do aluno…</p>)}
        {activeTab === 'dados' && cadastroReady && (
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
            accessRefreshStatus={accessRefresh.partnerId === alunoData.id ? accessRefresh.status : 'idle'}
            onRefreshAccess={retryAccessRefresh}
            tipo="Aluno"
            email={alunoData.email || null}
            matriculaAcesso={alunoData.matriculaAcesso || null}
            matriculaPrincipal={currentEnrollment?.numero || null}
            matriculaPrincipalStatus={isLoadingEnrollment ? 'loading' : enrollmentError ? 'error' : 'ready'}
            acessoStatus={alunoData.acessoStatus || null}
            acessoErro={alunoData.acessoErro || null}
            trocaSenhaObrigatoria={alunoData.trocaSenhaObrigatoria ?? null}
            credentialEvidence={{
              passwordUpdatedAt: alunoData.senhaAtualizadaEm ?? null,
              temporaryPasswordPending: alunoData.senhaTemporariaPendente ?? null,
              temporaryPasswordIssuedAt: alunoData.senhaTemporariaEmitidaEm ?? null,
              temporaryPasswordIssueId: alunoData.senhaTemporariaEmissaoId ?? null,
              temporaryPasswordIssueStartedAt: alunoData.senhaTemporariaEmissaoIniciadaEm ?? null,
              temporaryPasswordIssuePasswordChangedAt: alunoData.senhaTemporariaEmissaoSenhaAlteradaEm ?? null,
            }}
            aceitouTermosUso={alunoData.aceitouTermosUso ?? null}
            aceitouTermosUsoEm={alunoData.aceitouTermosUsoEm ?? null}
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

      <ToastNotification toasts={toasts} onRemove={removeToast} />

    </div>
  );
};

export default ParceiroAlunoDetalhes;
