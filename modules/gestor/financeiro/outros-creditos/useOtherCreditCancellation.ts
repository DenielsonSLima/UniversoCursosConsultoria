import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ContasReceber } from '../financeiro.types';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { generateSafeUuid } from '../../../../lib/randomUuid';
import { supabase } from '../../../../lib/supabase';
import { cancelOtherCredits, type OtherCreditCancellationResult } from './other-credit-cancellation.service';
import {
  otherCreditCancellationBlockReason, otherCreditCancellationSnapshot,
  selectableOtherCredits, toggleOtherCreditSelection,
} from './other-credit-cancellation.selection';
import {
  loadOtherCreditCancellationAttempts, saveOtherCreditCancellationAttempts,
  OTHER_CREDIT_PENDING_ATTEMPT_LIMIT, type OtherCreditCancellationAttempt,
} from './other-credit-cancellation.attempt';

export function useOtherCreditCancellation(items: ContasReceber[], scopeKey: string, allItems: ContasReceber[], poloId?: string | null) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewItems, setReviewItems] = useState<ContasReceber[]>([]);
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [results, setResults] = useState<OtherCreditCancellationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [savedAttempts, setSavedAttempts] = useState<OtherCreditCancellationAttempt[]>([]);
  const [resumeId, setResumeId] = useState('');
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const inFlight = useRef(false);
  const context = `${userId || ''}:${poloId || ''}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const reservedIds = new Set(savedAttempts.flatMap(attempt => attempt.receivableIds));
  const selectedItems = selectableOtherCredits(items).filter(item => selectedIds.has(item.id!) && !reservedIds.has(item.id!));
  const isOpen = reviewItems.length > 0;
  const selectionLocked = pending || savedAttempts.length >= OTHER_CREDIT_PENDING_ATTEMPT_LIMIT;
  const changed = !attempted && reviewItems.some(item => {
    const current = items.find(candidate => candidate.id === item.id);
    return !current || otherCreditCancellationBlockReason(current)
      || otherCreditCancellationSnapshot(current) !== otherCreditCancellationSnapshot(item);
  });

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      if (active) setUserId(session?.user.id || null);
    });
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (active && !authEventReceived) setUserId(sessionData.session?.user.id || null);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    setSavedAttempts(userId ? loadOtherCreditCancellationAttempts(userId, poloId) : []);
    setResumeError(null);
    setResumeId('');
    setSelectedIds(new Set());
    setReviewItems([]);
  }, [userId, poloId]);
  useEffect(() => { setSelectedIds(new Set()); }, [scopeKey]);
  useEffect(() => {
    const allowed = new Set(selectableOtherCredits(items).map(item => item.id!));
    setSelectedIds(previous => {
      const next = new Set([...previous].filter(id => allowed.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [items]);

  const close = () => {
    if (inFlight.current) return;
    setReviewItems([]);
    setResults([]);
    setError(null);
  };
  const open = (single?: ContasReceber) => {
    if (inFlight.current || selectionLocked) return;
    const targets = (single ? selectableOtherCredits([single]) : selectedItems).filter(item => !reservedIds.has(item.id!));
    if (!targets.length) return;
    setReviewItems(targets);
    setReason('');
    setIdempotencyKey(generateSafeUuid());
    setResults([]);
    setError(null);
    setAttempted(false);
    setStorageUnavailable(false);
  };
  const resume = () => {
    const savedAttempt = savedAttempts.find(attempt => attempt.idempotencyKey === resumeId) || savedAttempts[0];
    if (!savedAttempt || inFlight.current) return;
    const targets = savedAttempt.receivableIds.map(id => allItems.find(item => item.id === id));
    if (targets.some(item => !item)) {
      setResumeError('Aguarde o carregamento dos créditos deste polo para retomar a operação completa.');
      return;
    }
    setReviewItems(targets as ContasReceber[]);
    setReason(savedAttempt.reason);
    setIdempotencyKey(savedAttempt.idempotencyKey);
    setAttempted(true);
    setResults([]);
    setError(null);
    setResumeError(null);
  };
  const confirm = async () => {
    if (inFlight.current || changed || !reviewItems.length || reason.trim().length < 10) return;
    if (!userId) { setError('A sessão ainda não foi identificada. Aguarde e tente novamente.'); return; }
    const previousAttempt = savedAttempts.find(attempt => attempt.idempotencyKey === idempotencyKey);
    if (!previousAttempt && (selectionLocked || reviewItems.some(item => reservedIds.has(item.id!)))) return;
    const requestContext = context;
    const isCurrent = () => currentContext.current === requestContext;
    inFlight.current = true;
    setPending(true);
    setAttempted(true);
    setError(null);
    const request: OtherCreditCancellationAttempt = {
      receivableIds: reviewItems.map(item => item.id!), reason: reason.trim(), idempotencyKey,
      createdAt: previousAttempt?.createdAt || Date.now(),
    };
    const otherAttempts = savedAttempts.filter(attempt => attempt.idempotencyKey !== idempotencyKey);
    const attempts = [...otherAttempts, request];
    setSavedAttempts(attempts);
    setStorageUnavailable(!saveOtherCreditCancellationAttempts(userId, poloId, attempts));
    try {
      const response = await cancelOtherCredits({
        receivableIds: request.receivableIds, reason: request.reason, idempotencyKey: request.idempotencyKey,
      });
      const canceled = new Set(response.results.filter(item => item.status === 'CANCELED').map(item => item.receivableId));
      const next = canceled.size === request.receivableIds.length ? otherAttempts
        : [...otherAttempts, { ...request, idempotencyKey: response.operationId }];
      const persisted = saveOtherCreditCancellationAttempts(userId, poloId, next);
      if (isCurrent()) {
        setIdempotencyKey(response.operationId);
        setResults(response.results);
        setSelectedIds(previous => new Set([...previous].filter(id => !canceled.has(id))));
        setSavedAttempts(next);
        setStorageUnavailable(!persisted);
      }
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o resultado. Consulte novamente esta mesma operação.');
    } finally {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.conciliacaoBancariaRoot }),
      ]);
      inFlight.current = false;
      setPending(false);
    }
  };
  return {
    selectedIds, selectedItems, reviewItems, reason, setReason, pending, attempted, results, error,
    isOpen, changed, open, close, confirm, selectionLocked, reservedIds, savedAttempts,
    resume, resumeId, setResumeId, resumeError, storageUnavailable,
    clear: () => { if (!inFlight.current) setSelectedIds(new Set()); },
    toggle: (targets: ContasReceber[]) => {
      if (!selectionLocked) setSelectedIds(previous => toggleOtherCreditSelection(previous, targets.filter(item => !reservedIds.has(item.id!))));
    },
  };
}

export type OtherCreditCancellationModel = ReturnType<typeof useOtherCreditCancellation>;
