import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { alunoAtividadesExtraService } from './alunoAtividadesExtra.service';
import {
  ActivityResponseDraft,
  AtividadeExtraClasse,
} from './alunoAtividadesExtra.types';
import {
  alunoAtividadesExtraQueryKey,
  getAtividadeRespostaAtual,
  normalizeAlunoAtividadeSubmitError,
} from './alunoAtividadesExtra.utils';

export const useAlunoAtividadesExtraClasse = (alunoId: string, turmaId: string) => {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activityResponseDrafts, setActivityResponseDrafts] = useState<Record<string, ActivityResponseDraft>>({});

  const atividadesQuery = useQuery<AtividadeExtraClasse[]>({
    queryKey: alunoAtividadesExtraQueryKey(turmaId, alunoId),
    enabled: !!turmaId && !!alunoId,
    queryFn: () => alunoAtividadesExtraService.getAtividades(turmaId),
  });

  const submitAtividadeMutation = useMutation({
    mutationFn: (atividade: AtividadeExtraClasse) => alunoAtividadesExtraService.submitResposta({
      alunoId,
      atividade,
      draft: activityResponseDrafts[atividade.id],
    }),
    onMutate: () => setSubmitError(null),
    onSuccess: async (_data, atividade) => {
      setActivityResponseDrafts((prev) => {
        const next = { ...prev };
        delete next[atividade.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: alunoAtividadesExtraQueryKey(turmaId, alunoId) });
    },
    onError: (err) => setSubmitError(normalizeAlunoAtividadeSubmitError(err)),
  });

  useEffect(() => {
    if (!turmaId || !alunoId) return undefined;

    const invalidateAtividades = () => {
      queryClient.invalidateQueries({ queryKey: alunoAtividadesExtraQueryKey(turmaId, alunoId) });
    };

    const channel = supabase
      .channel(`aluno_atividades_extra_${turmaId}_${alunoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atividades_extra_classe', filter: `turma_id=eq.${turmaId}` },
        invalidateAtividades,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atividade_extra_classe_respostas', filter: `aluno_id=eq.${alunoId}` },
        invalidateAtividades,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient, turmaId]);

  const getAtividadeDraftTexto = (atividade: AtividadeExtraClasse) => {
    const respostaAtual = getAtividadeRespostaAtual(atividade);
    return activityResponseDrafts[atividade.id]?.texto ?? respostaAtual?.resposta_texto ?? '';
  };

  const getAtividadeDraftAnexo = (atividade: AtividadeExtraClasse) => {
    const respostaAtual = getAtividadeRespostaAtual(atividade);
    return activityResponseDrafts[atividade.id]?.anexoUrl ?? respostaAtual?.anexo_url ?? '';
  };

  const getAtividadeDraftResposta = (atividade: AtividadeExtraClasse, index: number) => {
    const respostaAtual = getAtividadeRespostaAtual(atividade);
    const respostas = Array.isArray(respostaAtual?.respostas) ? respostaAtual.respostas : [];
    return activityResponseDrafts[atividade.id]?.respostas?.[index] ?? respostas[index]?.resposta ?? '';
  };

  const updateAtividadeDraft = (atividadeId: string, patch: ActivityResponseDraft) => {
    setSubmitError(null);
    setActivityResponseDrafts((prev) => ({
      ...prev,
      [atividadeId]: {
        ...prev[atividadeId],
        ...patch,
        respostas: {
          ...(prev[atividadeId]?.respostas || {}),
          ...(patch.respostas || {}),
        },
      },
    }));
  };

  return {
    atividades: atividadesQuery.data ?? [],
    getAtividadeDraftAnexo,
    getAtividadeDraftResposta,
    getAtividadeDraftTexto,
    isError: atividadesQuery.isError,
    isLoading: atividadesQuery.isLoading,
    retryLoad: atividadesQuery.refetch,
    submitAtividadeMutation,
    submitError,
    updateAtividadeDraft,
  };
};
