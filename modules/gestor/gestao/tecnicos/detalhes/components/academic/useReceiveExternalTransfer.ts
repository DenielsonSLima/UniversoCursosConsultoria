import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../../../lib/supabase';
import { academicLifecycleKeys } from '../../academic-lifecycle.keys';
import { academicLifecycleService } from '../../academic-lifecycle.service';
import {
  transferErrorMessage,
  type ExternalTransferInput, type ExternalTransferPreview, type ExternalTransferResult, type ExternalTransferScheduleAdjustment,
} from './external-transfer.contract';
import {
  applyExternalTransferDefaults, buildExternalTransferInput, createExternalTransferDraft, externalTransferDraftError,
  externalTransferCreditsError, externalTransferFinancialError, externalTransferPlan, type ExternalTransferDraft,
} from './external-transfer-draft';
import { externalTransferService } from './external-transfer.service';
import { ExternalTransferAttempt } from './external-transfer-attempt';
import {
  buildExternalTransferFinancialAdjustments, clearExternalTransferFinancialConfigurationChanges,
  createExternalTransferFinancialConfigurations, externalTransferFinancialConfigurationError,
  syncExternalTransferFinancialConfigurations, updateExternalTransferFinancialConfiguration,
  type ExternalTransferCycleValues, type ExternalTransferFinancialConfigurations,
} from './external-transfer-financial-configuration';
import { applyExternalTransferConfigurationAdjustments } from './external-transfer-preview-runner';

export interface ExternalTransferStudent { id: string; nome: string; cpf_cnpj: string | null }
export interface ExternalTransferConfirmationIssue {
  message: string;
  recovery: 'GRADE' | 'FINANCIAL' | 'REVIEW' | null;
}
interface Options {
  turmaId: string;
  canReceive: boolean;
  initialStudent?: ExternalTransferStudent;
  onSaved: (result: ExternalTransferResult) => Promise<void>;
}
interface PreviewRequest {
  adjustment?: ExternalTransferScheduleAdjustment;
  restore?: boolean;
  adjustments?: Array<Extract<ExternalTransferScheduleAdjustment, { acao: 'CONFIGURAR_CICLO' }>>;
}
export const useReceiveExternalTransfer = ({ turmaId, canReceive, initialStudent, onSaved }: Options) => {
  const [draft, setDraft] = useState(() => createExternalTransferDraft(initialStudent?.id));
  const [configurations, setConfigurations] = useState<ExternalTransferFinancialConfigurations | null>(null);
  const [reviewed, setReviewed] = useState<{ studentId: string; planKey: string; data: ExternalTransferPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<ExternalTransferResult | null>(null);
  const attempt = useRef(new ExternalTransferAttempt());
  const defaultsApplied = useRef('');
  const previewBusy = useRef(false);
  const studentsQuery = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turmaId), 'alunos-recebimento'], enabled: !initialStudent,
    queryFn: async () => {
      const { data, error: loadError } = await supabase.from('parceiros').select('id, nome, cpf_cnpj').eq('tipo', 'Aluno').order('nome');
      if (loadError) throw loadError;
      return data || [];
    },
  });
  const gradeQuery = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turmaId), 'grade-recebimento-transferencia-v1'],
    queryFn: () => academicLifecycleService.getGradeRecebimentoTransferencia(turmaId), retry: false,
  });
  const modules = gradeQuery.data?.modulos || [];
  const disciplines = modules.flatMap((module) => module.disciplinas);
  const contextQuery = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turmaId), 'recebimento-financeiro-v3', draft.studentId],
    queryFn: () => externalTransferService.preview(draft.studentId, turmaId),
    enabled: Boolean(draft.studentId) && !attempt.current.hasInput && !result, retry: false,
  });
  const context = contextQuery.data;
  useEffect(() => {
    if (!context || attempt.current.hasInput) return;
    const contextKey = `${turmaId}:${draft.studentId}`;
    if (defaultsApplied.current === contextKey) return;
    defaultsApplied.current = contextKey;
    setDraft((current) => applyExternalTransferDefaults(current, context));
    setConfigurations(createExternalTransferFinancialConfigurations(context));
  }, [context, draft.studentId, turmaId]);
  const plan = externalTransferPlan(draft, context?.quantidadeMaxima || 0, context?.maxCiclos || 1);
  const planKey = JSON.stringify(plan);
  const review = reviewed?.studentId === draft.studentId && reviewed.planKey === planKey ? reviewed.data : null;
  const previewMutation = useMutation({
    mutationFn: async (request: PreviewRequest) => {
      if (!draft.studentId || (!request.restore && !plan)) throw new Error('Confira as informações de cada cobrança.');
      const studentId = draft.studentId;
      if (request.adjustments) {
        if (request.adjustments.length === 0) {
          const data = await externalTransferService.preview(studentId, turmaId, plan!);
          return { studentId, data, reviewed: false, restore: false };
        }
        const data = await applyExternalTransferConfigurationAdjustments({
          plan: plan!, adjustments: request.adjustments,
          preview: (current, adjustment) => externalTransferService.preview(studentId, turmaId, current, adjustment),
          onApplied: (applied, cycle) => {
            setDraft((current) => applyExternalTransferDefaults(current, applied));
            setConfigurations((current) => current ? clearExternalTransferFinancialConfigurationChanges(current, cycle) : current);
          },
        });
        return { studentId, data, reviewed: false, restore: false };
      }
      const data = await externalTransferService.preview(studentId, turmaId, request.restore ? null : plan, request.adjustment || null);
      return { studentId, data, reviewed: !request.restore && !request.adjustment, restore: Boolean(request.restore) };
    },
    onSuccess: (value) => {
      if (value.data) {
        const data = value.data;
        setDraft((current) => applyExternalTransferDefaults(current, data));
        setReviewed(value.reviewed ? { studentId: value.studentId, planKey: JSON.stringify(data.financeiro), data } : null);
        if (value.restore) setConfigurations(createExternalTransferFinancialConfigurations(data));
        if (data.regraFingerprint !== context?.regraFingerprint) void contextQuery.refetch();
      }
      setError(null);
    },
    onError: (failure) => { setReviewed(null); setError(transferErrorMessage(failure)); },
    retry: false,
  });
  const saveMutation = useMutation({ mutationFn: (input: ExternalTransferInput) => externalTransferService.receive(input), retry: false });
  const locked = saveMutation.isPending || previewMutation.isPending || uncertain || Boolean(result);
  const loading = !initialStudent && studentsQuery.isFetching;
  const loadError = !initialStudent && studentsQuery.isError;
  const academicError = gradeQuery.isError ? transferErrorMessage(gradeQuery.error) : null;
  const financialError = contextQuery.isError ? transferErrorMessage(contextQuery.error) : null;
  const creditsError = externalTransferCreditsError(draft, new Set(disciplines.map((discipline) => discipline.id)));
  const confirmationIssue: ExternalTransferConfirmationIssue | null = !canReceive
    ? { message: 'O recebimento não está disponível para este perfil ou fase da turma.', recovery: null }
    : academicError ? { message: `Não foi possível conferir a grade: ${academicError}`, recovery: 'GRADE' }
      : gradeQuery.isFetching ? { message: 'Conferindo a grade atual. Aguarde antes de registrar.', recovery: null }
        : creditsError ? { message: creditsError, recovery: 'GRADE' }
          : financialError ? { message: `Não foi possível conferir o financeiro: ${financialError}`, recovery: 'FINANCIAL' }
          : contextQuery.isFetching ? { message: 'Conferindo os padrões financeiros atuais. Aguarde antes de registrar.', recovery: null }
            : !review || review.regraFingerprint !== context?.regraFingerprint
              ? { message: 'A revisão financeira está desatualizada. Confira novamente as cobranças antes de registrar.', recovery: 'REVIEW' }
              : null;
  const ready = canReceive && !loading && !loadError && !contextQuery.isFetching && !contextQuery.isError
    && !previewMutation.isPending && Boolean(review) && !gradeQuery.isFetching && !academicError
    && review?.regraFingerprint === context?.regraFingerprint && !externalTransferDraftError(draft)
    && !creditsError;
  const change = <K extends keyof ExternalTransferDraft>(field: K, value: ExternalTransferDraft[K]) => {
    if (!attempt.current.canEdit || previewBusy.current) return;
    setError(null);
    if (field === 'studentId') {
      defaultsApplied.current = '';
      setDraft(createExternalTransferDraft(String(value)));
      setConfigurations(null);
      setReviewed(null);
      previewMutation.reset();
    } else setDraft((current) => ({ ...current, [field]: value }));
  };
  const requestPreview = async (request: PreviewRequest = {}): Promise<boolean> => {
    if (!canReceive || !attempt.current.canEdit || previewBusy.current || contextQuery.isFetching || contextQuery.isError) return false;
    previewBusy.current = true;
    setReviewed(null);
    setError(null);
    try {
      await previewMutation.mutateAsync(request);
      return true;
    } catch { return false; }
    finally { previewBusy.current = false; }
  };
  const changeConfiguration = <K extends keyof ExternalTransferCycleValues>(cycle: 1 | 2, field: K, value: ExternalTransferCycleValues[K]) => {
    if (!attempt.current.canEdit || previewBusy.current) return;
    setConfigurations((current) => current ? updateExternalTransferFinancialConfiguration(current, cycle, field, value) : current);
    setReviewed(null);
    setError(null);
  };
  const configurationError = configurations && context ? externalTransferFinancialConfigurationError(configurations, context) : null;
  const configurePlan = async (): Promise<boolean> => {
    if (!configurations || !context) return false;
    try { return await requestPreview({ adjustments: buildExternalTransferFinancialAdjustments(configurations, context) }); }
    catch (failure) { setError(transferErrorMessage(failure)); return false; }
  };
  const confirm = async () => {
    if (attempt.current.busy || result || (!attempt.current.hasInput && (!ready || !review))) return;
    try {
      setError(null);
      const saved = await attempt.current.run(() => buildExternalTransferInput(draft, turmaId, review!, crypto.randomUUID()), (input) => saveMutation.mutateAsync(input));
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
        void Promise.all([contextQuery.refetch(), gradeQuery.refetch()]);
      }
    }
  };
  return {
    draft, change, students: initialStudent ? [initialStudent] : studentsQuery.data || [], disciplines, modules,
    loading, loadError, context, financialError, financialLoading: contextQuery.isFetching,
    academicLoading: gradeQuery.isFetching, academicError, configurations, changeConfiguration, configurePlan,
    scheduleError: context ? externalTransferFinancialError(draft, context.quantidadeMaxima, context.maxCiclos) : null,
    canConfigure: canReceive && Boolean(configurations && context && plan) && !configurationError && !contextQuery.isFetching && !contextQuery.isError,
    syncConfigurations: () => {
      if (context && draft.items) setConfigurations((current) => current ? syncExternalTransferFinancialConfigurations(current, context, draft.items!) : current);
    },
    review, reviewing: previewMutation.isPending, canReview: canReceive && Boolean(plan) && !contextQuery.isFetching && !contextQuery.isError,
    restoreDefaults: () => requestPreview({ restore: true }),
    adjustSchedule: (adjustment: ExternalTransferScheduleAdjustment) => requestPreview({ adjustment: adjustment.acao === 'ADICIONAR_ITEM'
      ? { ...adjustment, periodicidade: configurations?.[adjustment.cicloNumero].periodicidade } : adjustment }),
    reviewPlan: () => requestPreview(),
    ready, pending: saveMutation.isPending, locked, uncertain, result, error, confirm, confirmationIssue,
    canClose: !saveMutation.isPending && !previewMutation.isPending && !uncertain, canDismiss: () => attempt.current.canClose && !previewBusy.current,
    retry: () => { if (!initialStudent) void studentsQuery.refetch(); },
    retryAcademic: () => { void gradeQuery.refetch(); },
    retryFinancial: () => { void contextQuery.refetch(); },
  };
};
