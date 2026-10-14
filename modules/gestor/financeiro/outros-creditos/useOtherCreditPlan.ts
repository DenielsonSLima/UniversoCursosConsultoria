import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { asaasIntegrationService } from '../../../asaas/asaas.service';
import { generateSafeUuid } from '../../../../lib/randomUuid';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { otherCreditPlanService } from './other-credit-plan.service';
import {
  initialOtherCreditPlanForm, issueOtherCreditPlanSequentially, otherCreditPlanEmissionState,
  recoverOrCreateOtherCreditPlan, refreshOtherCreditPlanSequentially,
  toOtherCreditPlanInput, validateOtherCreditPlanInput, type OtherCreditPlanForm,
} from './other-credit-plan.model';
import type { OtherCreditPlanInput, OtherCreditPlanPreview, OtherCreditPlanProgress } from './other-credit-plan.types';
import { parseCurrencyInput } from './outros-creditos.presentation';
import {
  clearOtherCreditPlanAttempt, loadOtherCreditPlanAttempt, saveOtherCreditPlanAttempt,
  markOtherCreditPlanAttemptUncertain, resolveOtherCreditPlanCreationFailure,
  type OtherCreditPlanCreationAttempt as CreationAttempt,
} from './other-credit-plan-attempt';

const planKey = (id: string | null, poloId?: string | null) => [...financeiroQueryKeys.outrosCreditosRoot, 'plano', poloId || '', id || ''];
const saveDocument = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'carne-outros-creditos.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

export function useOtherCreditPlan(poloId?: string | null) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [form, setForm] = useState(initialOtherCreditPlanForm);
  const [preview, setPreview] = useState<OtherCreditPlanPreview | null>(null);
  const [schedule, setSchedule] = useState<OtherCreditPlanPreview | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [attempt, setAttempt] = useState<CreationAttempt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<OtherCreditPlanProgress | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<OtherCreditPlanProgress | null>(null);
  const revision = useRef(0);
  const createInFlight = useRef(false);
  const bankOperationInFlight = useRef(false);
  const attempts = useRef(new Map<string, CreationAttempt>());
  const activePolo = useRef(poloId);
  activePolo.current = poloId;

  const invalidateCredits = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
    ]);
  };

  const planQuery = useQuery({
    queryKey: planKey(planId, poloId),
    queryFn: ({ signal }) => otherCreditPlanService.get(planId!, signal),
    enabled: isOpen && Boolean(planId && poloId),
    staleTime: 0,
    retry: false,
  });

  const previewMutation = useMutation({
    mutationFn: async (vars: { revision: number; poloId: string; input: OtherCreditPlanInput; review?: boolean }) => ({
      revision: vars.revision, poloId: vars.poloId,
      review: vars.review,
      preview: await otherCreditPlanService.preview(vars.poloId, vars.input),
    }),
    retry: false,
    onSuccess: result => {
      if (result.revision !== revision.current || result.poloId !== activePolo.current) return;
      setPreview(result.preview);
      setSchedule(result.preview);
      if (result.review) setStep(3);
    },
    onError: (error, vars) => {
      if (vars.revision === revision.current && vars.poloId === activePolo.current) setMessage(error.message);
    },
  });

  const createMutation = useMutation({
    mutationFn: (vars: CreationAttempt) => recoverOrCreateOtherCreditPlan(
      vars, id => otherCreditPlanService.get(id),
      (requestId, targetPolo, input) => otherCreditPlanService.create(requestId, targetPolo, input),
    ),
    retry: false,
    onSuccess: async (result, vars) => {
      attempts.current.delete(vars.poloId);
      clearOtherCreditPlanAttempt(vars.poloId);
      queryClient.setQueryData(planKey(result.plano.id, vars.poloId), result);
      if (vars.poloId === activePolo.current) {
        setPlanId(result.plano.id);
        setAttempt(null);
        setMessage(null);
      }
      await invalidateCredits();
    },
    onError: (error, vars) => {
      const previousAttempt = attempts.current.get(vars.poloId) || vars;
      const retainedAttempt = resolveOtherCreditPlanCreationFailure(previousAttempt, error);
      if (!retainedAttempt) {
        attempts.current.delete(vars.poloId);
        if (vars.poloId === activePolo.current) {
          revision.current += 1;
          setAttempt(null);
          setPreview(null);
          setMessage(`${error.message} Confira os dados e gere uma nova prévia antes de criar o carnê.`);
        }
        return;
      }
      attempts.current.set(vars.poloId, retainedAttempt);
      if (vars.poloId === activePolo.current) {
        setAttempt(retainedAttempt);
        setMessage(`${error.message} Use “Confirmar criação novamente” para consultar o mesmo pedido.`);
      }
    },
    onSettled: () => { createInFlight.current = false; },
  });

  const issueMutation = useMutation({
    mutationFn: async (vars: { id: string; poloId: string }) => issueOtherCreditPlanSequentially(
      vars.id,
      id => otherCreditPlanService.get(id),
      id => {
        if (activePolo.current !== vars.poloId) throw new Error('A unidade foi alterada. Reabra o carnê para continuar.');
        return asaasIntegrationService.syncReceivable(id);
      },
      next => { if (activePolo.current === vars.poloId) setProgress(next); },
    ),
    retry: false,
    onSuccess: (result, vars) => queryClient.setQueryData(planKey(vars.id, vars.poloId), result),
    onError: (error, vars) => { if (activePolo.current === vars.poloId) setMessage(error.message); },
    onSettled: async () => {
      try { await invalidateCredits(); } finally { bankOperationInFlight.current = false; }
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (vars: { id: string; poloId: string }) => refreshOtherCreditPlanSequentially(
      vars.id, id => otherCreditPlanService.get(id),
      id => {
        if (activePolo.current !== vars.poloId) throw new Error('A unidade foi alterada. Reabra o carnê para continuar.');
        return asaasIntegrationService.refreshReceivableStatus(id);
      },
      next => { if (activePolo.current === vars.poloId) setRefreshProgress(next); },
    ),
    retry: false,
    onSuccess: (result, vars) => {
      queryClient.setQueryData(planKey(vars.id, vars.poloId), result);
      if (vars.poloId !== activePolo.current) return;
      const reviews = result.receivables.filter(item => otherCreditPlanEmissionState(item) === 'review');
      if (reviews.some(item => item.gateway_submission_status === 'API_REVIEW')) {
        setMessage('Há uma cobrança com dados bancários em revisão. Confira este título antes de continuar a emissão.');
      } else if (reviews.length) {
        setMessage('Uma emissão ainda aguarda confirmação. Aguarde alguns instantes e atualize o carnê; nenhum novo boleto será enviado nesse estado.');
      }
    },
    onError: (error, vars) => { if (activePolo.current === vars.poloId) setMessage(error.message); },
    onSettled: async () => {
      try { await invalidateCredits(); } finally { bankOperationInFlight.current = false; }
    },
  });

  const documentMutation = useMutation({
    mutationFn: (id: string) => otherCreditPlanService.document(id),
    retry: false,
    onSuccess: saveDocument,
    onError: error => setMessage(error.message),
  });

  const busy = createMutation.isPending || issueMutation.isPending || refreshMutation.isPending || documentMutation.isPending;
  const changeForm = (patch: Partial<OtherCreditPlanForm>) => {
    if (attempt || busy) return;
    const changed = (Object.keys(patch) as Array<keyof OtherCreditPlanForm>)
      .some(key => JSON.stringify(form[key]) !== JSON.stringify(patch[key]));
    if (!changed) return;
    const resetSchedule = (['quantity', 'value', 'firstDueDate', 'periodicity'] as const)
      .some(key => key in patch && (key === 'value'
        ? parseCurrencyInput(patch.value!) !== parseCurrencyInput(form.value) : patch[key] !== form[key]));
    revision.current += 1;
    setForm(current => ({ ...current, ...patch, ...(resetSchedule ? { installments: [] } : {}) }));
    if (resetSchedule) setSchedule(null);
    setPreview(null);
    setMessage(null);
  };
  const openNew = () => {
    if (busy) return;
    revision.current += 1;
    const recoveredAttempt = attempts.current.get(poloId || '') || loadOtherCreditPlanAttempt(poloId || '');
    const pendingAttempt = recoveredAttempt ? markOtherCreditPlanAttemptUncertain(recoveredAttempt) : null;
    if (pendingAttempt) attempts.current.set(pendingAttempt.poloId, pendingAttempt);
    setPlanId(null);
    setAttempt(pendingAttempt);
    setForm({ ...initialOtherCreditPlanForm(), ...pendingAttempt?.form });
    setPreview(null);
    setSchedule(null);
    setStep(pendingAttempt ? 3 : 1);
    setMessage(pendingAttempt ? 'Há um pedido de criação aguardando confirmação. Confirme novamente para recuperar o mesmo carnê.' : null);
    setProgress(null);
    setRefreshProgress(null);
    setIsOpen(true);
  };
  const openPlan = (id: string) => {
    if (busy) return;
    setPlanId(id);
    setMessage(null);
    setProgress(null);
    setRefreshProgress(null);
    setIsOpen(true);
  };
  const previewPlan = (review = false) => {
    if (previewMutation.isPending || busy || attempt) return;
    const input = toOtherCreditPlanInput(form);
    const invalid = validateOtherCreditPlanInput(input, poloId);
    if (invalid) { setMessage(invalid); return; }
    setMessage(null);
    previewMutation.mutate({ revision: revision.current, poloId: poloId!, input, review });
  };
  const nextStep = () => {
    if (busy || attempt || previewMutation.isPending) return;
    if (step === 1) {
      if (!poloId || !form.partnerId || !form.description.trim()) {
        setMessage(!poloId ? 'Selecione uma unidade no topo do portal.' : !form.partnerId
          ? 'Selecione o pagador cadastrado.' : 'Informe a descrição do carnê.');
        return;
      }
      setMessage(null);
      setStep(2);
    } else if (step === 2) {
      if (preview) setStep(3);
      else previewPlan(true);
    }
  };
  const createPlan = () => {
    if (step !== 3 || createInFlight.current || busy || (!preview && !attempt) || !poloId) return;
    const vars: CreationAttempt = attempt || attempts.current.get(poloId) || {
      requestId: generateSafeUuid(), poloId, input: preview!.input, form, phase: 'pending',
    };
    attempts.current.set(poloId, vars);
    saveOtherCreditPlanAttempt(vars);
    setAttempt(vars);
    setMessage(null);
    createInFlight.current = true;
    createMutation.mutate(vars);
  };
  const issuePlan = () => {
    if (bankOperationInFlight.current || busy || !planId || !poloId) return;
    setMessage(null);
    setProgress(null);
    setRefreshProgress(null);
    bankOperationInFlight.current = true;
    issueMutation.mutate({ id: planId, poloId });
  };
  const refresh = () => {
    if (bankOperationInFlight.current || busy || !planId || !poloId) return;
    setMessage(null);
    setProgress(null);
    setRefreshProgress(null);
    bankOperationInFlight.current = true;
    refreshMutation.mutate({ id: planId, poloId });
  };

  useEffect(() => {
    revision.current += 1;
    setIsOpen(false);
    setPlanId(null);
    setAttempt(null);
    setPreview(null);
    setSchedule(null);
    setStep(1);
    setMessage(null);
  }, [poloId]);

  useEffect(() => {
    if (!isOpen || planId || step !== 2 || attempt || busy || preview || message || previewMutation.isPending) return undefined;
    const input = toOtherCreditPlanInput(form);
    if (validateOtherCreditPlanInput(input, poloId)) return undefined;
    const timer = window.setTimeout(() => {
      previewMutation.mutate({ revision: revision.current, poloId: poloId!, input });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [isOpen, planId, step, attempt, busy, preview, message, form, poloId, previewMutation.isPending, previewMutation.mutate]);

  const plan = planQuery.data;
  const states = plan?.receivables.map(otherCreditPlanEmissionState) || [];
  const pendingCount = states.filter(state => state === 'pending').length;
  const issuedCount = states.filter(state => state === 'issued').length;
  const needsReview = states.includes('review');
  const hasLocalBalance = states.includes('local');
  return {
    isOpen, planId, form, preview, schedule, step, attempt, message, busy, progress, refreshProgress,
    previewPending: previewMutation.isPending, createPending: createMutation.isPending,
    issuePending: issueMutation.isPending, documentPending: documentMutation.isPending,
    plan, planLoading: planQuery.isLoading, planError: planQuery.error?.message,
    planRefreshing: planQuery.isFetching || refreshMutation.isPending, pendingCount, issuedCount, needsReview, hasLocalBalance,
    changeForm, openNew, openPlan, previewPlan, nextStep, createPlan, issuePlan,
    previousStep: () => { if (!busy && !attempt) { setStep(current => current === 3 ? 2 : 1); setMessage(null); } },
    close: () => { if (!busy) setIsOpen(false); },
    refresh,
    download: () => { if (!busy && planId) { setMessage(null); documentMutation.mutate(planId); } },
  };
}

export type OtherCreditPlanModel = ReturnType<typeof useOtherCreditPlan>;
