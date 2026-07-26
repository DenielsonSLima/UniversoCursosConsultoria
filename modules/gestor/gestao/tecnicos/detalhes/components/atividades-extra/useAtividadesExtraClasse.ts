import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../../lib/supabase';
import { academicLifecycleKeys } from '../../academic-lifecycle.keys';
import {
  atividadesExtraClasseKeys,
  atividadesExtraClasseService,
} from './atividadesExtraClasse.service';
import {
  AtividadeExtraClasseResposta,
  AtividadeExtraClasseRecord,
  AtividadesExtraClasseProps,
  CorrectionDraft,
} from './atividadesExtraClasse.types';
import {
  createAtividadeFormInitialState,
  getAtividadeErrorMessage,
  isAtividadeContextoOperacional,
  isAtividadeTurmaPreparacao,
  normalizeAtividadeErrorMessage,
} from './atividadesExtraClasse.utils';
import { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { gestaoQueryKeys } from '../../../../gestao.query-keys';
import type { Turma } from '../../../../gestao.types';

export const useAtividadesExtraClasse = ({
  turmaId,
  cursoId,
  disciplinaIdRestrita,
  professorId,
  modo = 'GESTOR',
  readOnly = false,
  readOnlyMessage,
}: AtividadesExtraClasseProps) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [form, setForm] = useState(createAtividadeFormInitialState(disciplinaIdRestrita || ''));
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, CorrectionDraft>>({});
  const [realtimeError, setRealtimeError] = useState<string | null>(null);

  const turmaCursoQuery = useQuery({
    queryKey: [...atividadesExtraClasseKeys.turma(turmaId), 'curso'],
    enabled: !!turmaId,
    queryFn: () => atividadesExtraClasseService.getTurmaCurso(turmaId),
  });
  const turmaCurso = turmaCursoQuery.data;

  const effectiveCursoId = cursoId || turmaCurso?.curso_id || null;

  const { data: disciplinas = [], isError: disciplinasErro, isLoading: loadingDisciplinas } = useQuery({
    queryKey: atividadesExtraClasseKeys.disciplinas(turmaId, effectiveCursoId, disciplinaIdRestrita),
    enabled: !!turmaId && (!!effectiveCursoId || !!disciplinaIdRestrita),
    queryFn: () => atividadesExtraClasseService.getDisciplinas({
      turmaId,
      cursoId: effectiveCursoId,
      disciplinaIdRestrita,
    }),
  });

  const { data: atividades = [], isError: atividadesErro, isLoading: loadingAtividades } = useQuery({
    queryKey: atividadesExtraClasseKeys.list(turmaId, disciplinaIdRestrita),
    enabled: !!turmaId,
    queryFn: () => atividadesExtraClasseService.getAtividades(turmaId, disciplinaIdRestrita),
  });

  useEffect(() => {
    if (form.disciplinaId) return;
    const firstDisciplina = disciplinas[0];
    if (firstDisciplina?.id) {
      setForm((prev) => ({ ...prev, disciplinaId: firstDisciplina.id }));
    }
  }, [disciplinas, form.disciplinaId]);

  const disciplinaSelecionada = useMemo(
    () => disciplinas.find((disciplina) => disciplina.id === form.disciplinaId) || null,
    [disciplinas, form.disciplinaId],
  );

  const turmaStatus = String(turmaCurso?.status || '').toUpperCase();
  const cursoRelation = Array.isArray(turmaCurso?.curso) ? turmaCurso.curso[0] : turmaCurso?.curso;
  const modalidade = String(cursoRelation?.modalidade || 'TECNICO').toUpperCase() as Turma['modalidade'];
  const isTecnico = modalidade === 'TECNICO';
  const isPreparacao = isTecnico && isAtividadeTurmaPreparacao(turmaStatus);
  const isOperacionalSelecionada = isTecnico
    ? isAtividadeContextoOperacional(turmaStatus, disciplinaSelecionada?.periodoStatus)
    : !readOnly;
  const createAsDraft = modo === 'GESTOR' && isPreparacao;
  const canCreate = !readOnly && (createAsDraft || isOperacionalSelecionada);

  const getDisciplinaPeriodoStatus = (disciplinaId: string) =>
    disciplinas.find((disciplina) => disciplina.id === disciplinaId)?.periodoStatus || null;

  const canOperateAtividade = (atividade: AtividadeExtraClasseRecord) => !readOnly && (
    !isTecnico
    || isAtividadeContextoOperacional(turmaStatus, getDisciplinaPeriodoStatus(atividade.disciplina_id))
  );

  const canRemoveAtividade = (atividade: AtividadeExtraClasseRecord) => (
    canOperateAtividade(atividade)
    || (!readOnly && modo === 'GESTOR' && isPreparacao && atividade.status === 'RASCUNHO')
  );

  const accessMessage = readOnly
    ? readOnlyMessage || 'Este período está fechado. As atividades ficam disponíveis apenas para consulta.'
    : createAsDraft
      ? 'A turma ainda não começou. Nesta fase, o gestor pode salvar somente rascunhos; a publicação será liberada quando o período estiver operacional.'
      : isTecnico && turmaStatus === 'FINALIZADA'
        ? 'A turma está finalizada. Atividades e correções estão disponíveis somente para consulta.'
        : isTecnico && turmaStatus !== 'EM_ANDAMENTO'
          ? 'Atividades só podem ser publicadas durante a fase EM ANDAMENTO.'
          : !isOperacionalSelecionada
            ? 'Selecione uma disciplina com período ABERTO ou EM FECHAMENTO para publicar.'
            : null;

  const invalidateActivity = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: atividadesExtraClasseKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turmaId) }),
    ]);
  };

  const invalidateProgress = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: atividadesExtraClasseKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality(modalidade) }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.activeClassesRoot() }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => atividadesExtraClasseService.createAtividade({
      turmaId,
      form,
      modo,
      status: createAsDraft ? 'RASCUNHO' : 'PUBLICADA',
    }),
    onSuccess: async () => {
      setForm((prev) => ({
        ...createAtividadeFormInitialState(disciplinaIdRestrita || prev.disciplinaId),
        disciplinaId: disciplinaIdRestrita || prev.disciplinaId,
      }));
      await invalidateProgress();
      if (createAsDraft) {
        toast.success('Rascunho salvo', 'A atividade poderá ser publicada quando o período estiver operacional.');
      } else {
        toast.success('Atividade publicada', 'Os alunos já podem responder pelo portal.');
      }
    },
    onError: (err: unknown) => {
      const message = normalizeAtividadeErrorMessage(getAtividadeErrorMessage(err));
      if (message.includes('Carga horária excedida')) {
        toast.info('Carga horária excedida', message, { contextLabel: 'Atividade extra-classe' });
        return;
      }
      const canShowMessage = message.startsWith('Selecione')
        || message.startsWith('Informe')
        || message.startsWith('O link')
        || message.includes('carga horária');
      toast.error(
        'Atividade não publicada',
        canShowMessage ? message : 'Não consegui publicar esta atividade agora. Revise os dados e tente novamente.',
      );
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (atividade: AtividadeExtraClasseRecord) => atividade.status === 'RASCUNHO'
      ? atividadesExtraClasseService.deleteDraft(atividade.id)
      : atividadesExtraClasseService.archiveAtividade(atividade.id),
    onSuccess: async (_data, atividade) => {
      await invalidateProgress();
      if (atividade.status === 'RASCUNHO') {
        toast.success('Rascunho excluído', 'O rascunho foi removido sem afetar alunos.');
      } else {
        toast.success('Atividade arquivada', 'Ela não será mais exibida para os alunos.');
      }
    },
    onError: () => toast.error('Atividade não arquivada', 'Não consegui arquivar esta atividade agora. Tente novamente em instantes.'),
  });

  const publishMutation = useMutation({
    mutationFn: (atividadeId: string) => atividadesExtraClasseService.publishAtividade(atividadeId),
    onSuccess: async () => {
      await invalidateProgress();
      toast.success('Atividade publicada', 'O rascunho já está disponível aos alunos.');
    },
    onError: () => toast.error(
      'Atividade não publicada',
      'Confirme se a turma está em andamento e se o período da disciplina está aberto.',
    ),
  });

  const corrigirMutation = useMutation({
    mutationFn: async (resposta: AtividadeExtraClasseResposta) => {
      const draft = correctionDrafts[resposta.id] || {};
      const notaValue = draft.nota ?? resposta.nota ?? '';
      const nota = notaValue === '' ? null : Number(String(notaValue).replace(',', '.'));

      if (nota !== null && (!Number.isFinite(nota) || nota < 0 || nota > 10)) {
        throw new Error('A nota precisa estar entre 0 e 10.');
      }

      await atividadesExtraClasseService.corrigirResposta({
        respostaId: resposta.id,
        nota,
        feedback: draft.feedback ?? resposta.feedback ?? null,
      });
    },
    onSuccess: async () => {
      await invalidateActivity();
      toast.success('Correção salva', 'A resposta foi atualizada para o aluno.');
    },
    onError: (err: unknown) => toast.error(
      'Correção não salva',
      getAtividadeErrorMessage(err) === 'A nota precisa estar entre 0 e 10.'
        ? getAtividadeErrorMessage(err)
        : 'Não consegui salvar a correção agora. Revise a nota e tente novamente.',
    ),
  });

  useEffect(() => {
    if (!turmaId) return undefined;

    const invalidateActivityRealtime = () => {
      void queryClient.invalidateQueries({ queryKey: atividadesExtraClasseKeys.turma(turmaId) });
      void queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turmaId) });
    };
    const invalidateProgressRealtime = () => {
      invalidateActivityRealtime();
      void queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality(modalidade) });
      void queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.activeClassesRoot() });
    };

    const channel = supabase
      .channel(`atividades_extra_${modo.toLowerCase()}_${turmaId}_${professorId || 'gestor'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atividades_extra_classe', filter: `turma_id=eq.${turmaId}` },
        invalidateProgressRealtime,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atividade_extra_classe_respostas' },
        invalidateActivityRealtime,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeError(null);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeError('As atualizações automáticas estão indisponíveis. Use “Tentar novamente” para atualizar os dados.');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [modalidade, modo, professorId, queryClient, turmaId]);

  return {
    atividades,
    hasLoadError: turmaCursoQuery.isError || disciplinasErro || atividadesErro,
    archiveMutation,
    corrigirMutation,
    correctionDrafts,
    createMutation,
    createAsDraft,
    publishMutation,
    disciplinaSelecionada,
    disciplinas,
    form,
    canCreate,
    canOperateAtividade,
    canRemoveAtividade,
    accessMessage,
    loading: turmaCursoQuery.isLoading || loadingDisciplinas || loadingAtividades,
    removeToast,
    setCorrectionDrafts,
    setForm,
    toasts,
    realtimeError,
    retryLoad: async () => {
      const retries = [
        queryClient.refetchQueries({ queryKey: atividadesExtraClasseKeys.turma(turmaId) }),
      ];
      if (!cursoId) retries.push(turmaCursoQuery.refetch().then(() => undefined));
      await Promise.all(retries);
    },
  };
};
