import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../../../lib/supabase';
import { academicLifecycleKeys } from '../../academic-lifecycle.keys';
import { academicLifecycleService } from '../../academic-lifecycle.service';
import {
  transferErrorMessage,
  type ExternalTransferInput, type ExternalTransferPreview, type ExternalTransferResult,
} from './external-transfer.contract';
import {
  buildExternalTransferInput, createExternalTransferDraft, externalTransferDraftError,
  externalTransferPlan, type ExternalTransferDraft,
} from './external-transfer-draft';
import { externalTransferService } from './external-transfer.service';
import { ExternalTransferAttempt } from './external-transfer-attempt';

interface Options {
  turmaId: string;
  canReceive: boolean;
  onSaved: (result: ExternalTransferResult) => Promise<void>;
}

export const useReceiveExternalTransfer = ({ turmaId, canReceive, onSaved }: Options) => {
  const [draft, setDraft] = useState(createExternalTransferDraft);
  const [reviewed, setReviewed] = useState<{ studentId: string; planKey: string; data: ExternalTransferPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<ExternalTransferResult | null>(null);
  const attempt = useRef(new ExternalTransferAttempt());

  const studentsQuery = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turmaId), 'alunos-recebimento'],
    queryFn: async () => {
      const { data, error: loadError } = await supabase.from('parceiros')
        .select('id, nome, cpf_cnpj').eq('tipo', 'Aluno').order('nome');
      if (loadError) throw loadError;
      return data || [];
    },
  });
  const disciplinesQuery = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turmaId), 'disciplinas-aproveitamento'],
    queryFn: () => academicLifecycleService.getDisciplinasAproveitamento(turmaId),
  });
  const contextQuery = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turmaId), 'recebimento-financeiro', draft.studentId],
    queryFn: () => externalTransferService.preview(draft.studentId, turmaId),
    enabled: Boolean(draft.studentId) && !attempt.current.hasInput && !result,
    retry: false,
  });
  const context = contextQuery.data;
  useEffect(() => {
    if (!context || attempt.current.hasInput) return;
    setDraft((current) => current.installments ? current : {
      ...current, installments: String(context.financeiro.quantidadeParcelas),
    });
  }, [context]);

  const plan = externalTransferPlan(draft, context?.quantidadeMaxima || 0);
  const planKey = JSON.stringify(plan);
  const review = reviewed?.studentId === draft.studentId && reviewed.planKey === planKey ? reviewed.data : null;
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!plan || !draft.studentId) throw new Error('Preencha ciclo, parcelas e primeiro vencimento.');
      const studentId = draft.studentId;
      const data = await externalTransferService.preview(studentId, turmaId, plan);
      return { studentId, planKey, data };
    },
    onSuccess: (value) => {
      setReviewed(value);
      setError(null);
      if (value.data.regraFingerprint !== context?.regraFingerprint) void contextQuery.refetch();
    },
    onError: (failure) => { setReviewed(null); setError(transferErrorMessage(failure)); },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (input: ExternalTransferInput) => externalTransferService.receive(input),
    retry: false,
  });
  const locked = saveMutation.isPending || uncertain || Boolean(result);
  const loading = studentsQuery.isFetching || disciplinesQuery.isFetching;
  const loadError = studentsQuery.isError || disciplinesQuery.isError;
  const financialError = contextQuery.isError ? transferErrorMessage(contextQuery.error) : null;
  const ready = canReceive && !loading && !loadError && !contextQuery.isFetching
    && !contextQuery.isError && !previewMutation.isPending && !previewMutation.isError
    && Boolean(review) && review?.regraFingerprint === context?.regraFingerprint
    && !externalTransferDraftError(draft);

  const change = <K extends keyof ExternalTransferDraft>(field: K, value: ExternalTransferDraft[K]) => {
    if (!attempt.current.canEdit) return;
    setError(null);
    if (field === 'studentId') {
      setDraft(createExternalTransferDraft(String(value)));
      setReviewed(null);
      previewMutation.reset();
    } else setDraft((current) => ({ ...current, [field]: value }));
  };

  const confirm = async () => {
    if (attempt.current.busy || result || (!attempt.current.hasInput && (!ready || !review))) return;
    try {
      setError(null);
      const saved = await attempt.current.run(
        () => buildExternalTransferInput(draft, turmaId, review!, crypto.randomUUID()),
        (input) => saveMutation.mutateAsync(input),
      );
      if (!saved) return;
      setResult(saved);
      setUncertain(false);
      try { await onSaved(saved); }
      catch { setError('Recebimento registrado. Atualize a turma para consultar os dados.'); }
    } catch (failure) {
      setError(transferErrorMessage(failure));
      setUncertain(attempt.current.uncertain);
      if (!attempt.current.hasInput) {
        setReviewed(null);
        void contextQuery.refetch();
      }
    }
  };

  return {
    draft, change, students: studentsQuery.data || [], disciplines: disciplinesQuery.data || [],
    loading, loadError, context, financialError, financialLoading: contextQuery.isFetching,
    review, reviewing: previewMutation.isPending, canReview: Boolean(plan) && !contextQuery.isFetching && !contextQuery.isError,
    reviewPlan: () => { if (attempt.current.canEdit && !previewMutation.isPending) previewMutation.mutate(); },
    ready, pending: saveMutation.isPending, locked, uncertain, result, error, confirm,
    canClose: !saveMutation.isPending && !uncertain,
    canDismiss: () => attempt.current.canClose,
    retry: () => { void Promise.all([studentsQuery.refetch(), disciplinesQuery.refetch()]); },
    retryFinancial: () => { void contextQuery.refetch(); },
  };
};
