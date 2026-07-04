import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../academic-lifecycle.keys';
import {
  atividadesExtraClasseKeys,
  atividadesExtraClasseService,
} from './atividadesExtraClasse.service';
import {
  AtividadesExtraClasseProps,
  CorrectionDraft,
} from './atividadesExtraClasse.types';
import {
  createAtividadeFormInitialState,
  normalizeAtividadeErrorMessage,
} from './atividadesExtraClasse.utils';
import { useToast } from '../../../../../parceiros/components/shared/ToastNotification';

export const useAtividadesExtraClasse = ({
  turmaId,
  cursoId,
  disciplinaIdRestrita,
  professorId,
  modo = 'GESTOR',
}: AtividadesExtraClasseProps) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [form, setForm] = useState(createAtividadeFormInitialState(disciplinaIdRestrita || ''));
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, CorrectionDraft>>({});

  const { data: turmaCurso } = useQuery({
    queryKey: [...atividadesExtraClasseKeys.turma(turmaId), 'curso'],
    enabled: !!turmaId && !cursoId,
    queryFn: () => atividadesExtraClasseService.getTurmaCurso(turmaId),
  });

  const effectiveCursoId = cursoId || turmaCurso?.curso_id || null;

  const { data: disciplinas = [], isError: disciplinasErro, isLoading: loadingDisciplinas } = useQuery({
    queryKey: atividadesExtraClasseKeys.disciplinas(turmaId, effectiveCursoId, disciplinaIdRestrita),
    enabled: !!turmaId && (!!effectiveCursoId || !!disciplinaIdRestrita),
    queryFn: () => atividadesExtraClasseService.getDisciplinas({
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

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: atividadesExtraClasseKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turmaId) }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => atividadesExtraClasseService.createAtividade({
      turmaId,
      form,
      modo,
      professorId,
    }),
    onSuccess: async () => {
      setForm((prev) => ({
        ...createAtividadeFormInitialState(disciplinaIdRestrita || prev.disciplinaId),
        disciplinaId: disciplinaIdRestrita || prev.disciplinaId,
      }));
      await invalidate();
      toast.success('Atividade publicada', 'Os alunos já podem responder pelo portal.');
    },
    onError: (err: any) => {
      const message = normalizeAtividadeErrorMessage(String(err?.message || ''));
      if (message.includes('Carga horária excedida')) {
        toast.info('Carga horária excedida', message, { contextLabel: 'Atividade extra-classe' });
        return;
      }
      const canShowMessage = message.startsWith('Selecione')
        || message.startsWith('Informe')
        || message.includes('carga horária');
      toast.error(
        'Atividade não publicada',
        canShowMessage ? message : 'Não consegui publicar esta atividade agora. Revise os dados e tente novamente.',
      );
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (atividadeId: string) => atividadesExtraClasseService.archiveAtividade(atividadeId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Atividade arquivada', 'Ela não será mais exibida para os alunos.');
    },
    onError: () => toast.error('Atividade não arquivada', 'Não consegui arquivar esta atividade agora. Tente novamente em instantes.'),
  });

  const corrigirMutation = useMutation({
    mutationFn: async (resposta: any) => {
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
      await invalidate();
      toast.success('Correção salva', 'A resposta foi atualizada para o aluno.');
    },
    onError: (err: any) => toast.error(
      'Correção não salva',
      err?.message === 'A nota precisa estar entre 0 e 10.'
        ? err.message
        : 'Não consegui salvar a correção agora. Revise a nota e tente novamente.',
    ),
  });

  return {
    atividades,
    hasLoadError: disciplinasErro || atividadesErro,
    archiveMutation,
    corrigirMutation,
    correctionDrafts,
    createMutation,
    disciplinaSelecionada,
    disciplinas,
    form,
    loading: loadingDisciplinas || loadingAtividades,
    removeToast,
    setCorrectionDrafts,
    setForm,
    toasts,
  };
};
