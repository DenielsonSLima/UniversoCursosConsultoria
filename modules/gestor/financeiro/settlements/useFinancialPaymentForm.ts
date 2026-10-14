import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { generateSafeUuid } from '../../../../lib/randomUuid';
import { todayInMaceio } from '../receber/components/manual-settlement/manual-settlement-date';
import { FinancialPaymentError, getFinancialPaymentHistory, previewFinancialPayment } from './financial-payment.service';
import type { FinancialPaymentConfirmation, FinancialPaymentHistory, FinancialPaymentInput, FinancialPaymentPreview, FinancialPaymentResult, FinancialPaymentSourceKind } from './financial-payment.types';
import { draftFromCanonical, isStoredFinancialPayment, normalizePaymentDraft, paymentMoneyInput } from './financial-payment.form';

const attemptKey = (userId: string, kind: FinancialPaymentSourceKind, id: string) => `universo:financial-payment:v1:${userId}:${kind}:${id}`;
const storeAttempt = (key: string, value: FinancialPaymentConfirmation | null) => {
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
    return true;
  } catch { return false; }
};
const loadAttempt = (key: string, sourceId: string): FinancialPaymentConfirmation | null => {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) || 'null') as FinancialPaymentConfirmation;
    if (!isStoredFinancialPayment(value, sourceId)) return null;
    return value;
  } catch { return null; }
};

export function useFinancialPaymentForm(sourceKind: FinancialPaymentSourceKind, sourceId: string, initialAccountId: string,
  onConfirm: (payload: FinancialPaymentConfirmation) => Promise<FinancialPaymentResult>) {
  const [draft, setDraft] = useState<FinancialPaymentInput>(() => ({ requestId: generateSafeUuid(), sourceId,
    paymentDate: todayInMaceio(), components: [{ accountId: initialAccountId, method: 'DINHEIRO', amount: '' }],
    interest: '', penalty: '', addition: '', discount: '', notes: '' }));
  const [history, setHistory] = useState<FinancialPaymentHistory | null>(null);
  const [preview, setPreview] = useState<FinancialPaymentPreview | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [automaticAmount, setAutomaticAmount] = useState(true);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<FinancialPaymentConfirmation | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const storageKey = useRef('');
  const inFlight = useRef(false);
  const input = useMemo(() => normalizePaymentDraft(draft), [draft]);
  const automatic = automaticAmount && draft.components.length === 1;
  const inputKey = input ? JSON.stringify({ input, automatic }) : '';
  const disableAutomaticAmount = () => setAutomaticAmount(false);
  const setPaymentAmount = (index: number, amount: string) => {
    setAutomaticAmount(false);
    setDraft(current => ({ ...current, components: current.components.map((component, row) =>
      row === index ? { ...component, amount } : component) }));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([getFinancialPaymentHistory(sourceKind, sourceId), supabase.auth.getSession()]).then(([data, session]) => {
      if (!active) return;
      const userId = session.data.session?.user.id;
      if (!userId) throw new Error('Sua sessão precisa ser renovada para registrar o pagamento.');
      storageKey.current = attemptKey(userId, sourceKind, sourceId);
      const saved = loadAttempt(storageKey.current, sourceId);
      setHistory(data);
      if (saved) { setAutomaticAmount(false); setSubmitted(saved); setDraft(draftFromCanonical(saved.input)); }
      else setDraft(current => ({ ...current, components: [{ ...current.components[0], amount: paymentMoneyInput(data.summary.remainingBefore) }] }));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o saldo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceKind, sourceId]);

  useEffect(() => {
    if (loading || submitted || !input || !draft.paymentDate) { setPreviewLoading(false); return; }
    if (preview && previewKey === inputKey) { setPreviewLoading(false); return; }
    let active = true;
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void previewFinancialPayment(sourceKind, input, automatic).then(result => {
        if (!active) return;
        if (automatic) {
          const amount = result.components[0]?.amount;
          if (typeof amount !== 'string') throw new Error('O valor atualizado não foi confirmado pelo servidor.');
          const adjustedInput = { ...input, components: [{ ...input.components[0], amount }] };
          setDraft(current => ({ ...current, components: [{ ...current.components[0], amount: paymentMoneyInput(amount) }] }));
          setPreviewKey(JSON.stringify({ input: adjustedInput, automatic }));
        } else setPreviewKey(inputKey);
        setPreview(result); setError(null);
      }).catch(cause => { if (active) { setPreview(null); setPreviewKey(''); setError(cause instanceof Error ? cause.message : 'Não foi possível conferir o pagamento.'); } })
        .finally(() => { if (active) setPreviewLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [inputKey, loading, sourceKind, submitted]);

  const canConfirm = !loading && !pending && (Boolean(submitted) || Boolean(input && preview && previewKey === inputKey && !previewLoading));
  const confirm = async () => {
    if (inFlight.current || !canConfirm || !storageKey.current) return;
    const payload = submitted || { input: input!, fingerprint: preview!.fingerprint };
    inFlight.current = true; setPending(true); setError(null);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user.id;
      if (!userId || attemptKey(userId, sourceKind, sourceId) !== storageKey.current) throw new Error('A sessão mudou. Feche esta janela e abra o lançamento novamente.');
      setSubmitted(payload);
      setStorageWarning(!storeAttempt(storageKey.current, payload));
      await onConfirm(payload);
      storeAttempt(storageKey.current, null);
    } catch (cause) {
      if (cause instanceof FinancialPaymentError && cause.safeToEdit) {
        storeAttempt(storageKey.current, null); setSubmitted(null); setPreview(null); setPreviewKey('');
        setDraft(current => ({ ...current, requestId: generateSafeUuid() }));
      }
      setError(cause instanceof Error ? cause.message : 'Resultado ainda não confirmado. Confira esta mesma operação.');
    } finally { inFlight.current = false; setPending(false); }
  };
  return { draft, setDraft, setPaymentAmount, disableAutomaticAmount, history, preview: previewKey === inputKey ? preview : null, loading, previewLoading,
    pending, error, submitted, storageWarning, canConfirm, confirm, locked: pending || Boolean(submitted) };
}

export type FinancialPaymentForm = ReturnType<typeof useFinancialPaymentForm>;
