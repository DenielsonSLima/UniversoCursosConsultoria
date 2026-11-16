import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isEadCouponsEnvironmentAllowed } from '../coupons-environment';
import { useEadCouponsAvailability } from './useEadCouponsAvailability';
import { eadCouponStudentKeys } from '../coupons-student.keys';
import { eadCouponStudentService, normalizeEadCouponCode } from '../coupons-student.service';
import type { EadCouponQuote } from '../coupons-student.types';
import { useEadCouponStudentRealtime } from './useEadCouponStudentRealtime';

interface CouponDraft { scope: string; code: string; applied: string }
interface Input {
  alunoId?: string;
  courseId?: string;
  onFreeConfirmed: () => void;
}

export const useEadCouponCheckout = ({ alunoId, courseId, onFreeConfirmed }: Input) => {
  const contextReady = isEadCouponsEnvironmentAllowed() && Boolean(alunoId && courseId);
  const enabled = useEadCouponsAvailability(alunoId ? `aluno:${alunoId}` : '', contextReady);
  const scope = `${alunoId || ''}:${courseId || ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [draft, setDraft] = useState<CouponDraft>({ scope: '', code: '', applied: '' });
  const current = draft.scope === scope ? draft : { scope, code: '', applied: '' };
  const requestIds = useRef(new Map<string, string>());
  const freeLock = useRef(false);
  const queryClient = useQueryClient();
  const quoteQuery = useQuery({
    queryKey: eadCouponStudentKeys.quote(alunoId || '', courseId || '', current.applied),
    enabled: enabled && Boolean(current.applied),
    queryFn: ({ signal }) => eadCouponStudentService.quote({ code: current.applied, courseId: courseId! }, signal),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const freeMutation = useMutation({
    mutationFn: ({ quote, requestId }: { quote: EadCouponQuote; requestId: string; scope: string }) =>
      eadCouponStudentService.redeemFree({ code: quote.code, turmaId: quote.turmaId, requestId }),
    retry: false,
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: eadCouponStudentKeys.student(alunoId || '') });
      if (scopeRef.current === input.scope) onFreeConfirmed();
    },
    onSettled: () => { freeLock.current = false; },
  });
  const quote = enabled && current.applied && !quoteQuery.isError ? quoteQuery.data || null : null;
  useEadCouponStudentRealtime(enabled ? alunoId : undefined, quote?.couponId);
  const setCode = (code: string) => {
    freeMutation.reset();
    setDraft({ scope, code: code.slice(0, 64), applied: '' });
  };
  const apply = () => {
    if (!enabled || freeLock.current) return;
    const code = normalizeEadCouponCode(current.code);
    if (!code) return;
    freeMutation.reset();
    if (current.applied === code) void quoteQuery.refetch();
    else setDraft({ scope, code, applied: code });
  };
  const redeemFree = () => {
    if (!enabled || !quote || quote.discountPercent !== 100 || quoteQuery.isFetching || freeLock.current) return;
    const key = `${scope}:${quote.couponId}:${quote.turmaId}:${quote.code}`;
    let requestId = quote.requestId || requestIds.current.get(key);
    if (!requestId) { requestId = crypto.randomUUID(); requestIds.current.set(key, requestId); }
    freeLock.current = true;
    freeMutation.mutate({ quote, requestId, scope });
  };
  return {
    enabled, visible: enabled || (contextReady && Boolean(current.code)), code: current.code, quote, setCode, apply, redeemFree,
    clear: () => setCode(''),
    isChecking: Boolean(current.applied) && quoteQuery.isFetching,
    isRedeeming: freeMutation.isPending,
    error: !enabled && contextReady && current.code ? 'Cupons indisponíveis no momento. Remova o código para continuar sem desconto.'
      : enabled ? ((freeMutation.variables?.scope === scope ? freeMutation.error?.message : '') || (current.applied ? quoteQuery.error?.message : '') || '') : '',
  };
};

export type EadCouponCheckoutState = ReturnType<typeof useEadCouponCheckout>;
