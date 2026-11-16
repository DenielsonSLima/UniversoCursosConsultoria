import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { generateSafeUuid } from '../../../../../lib/randomUuid';
import {
  ExpenseWithoutChargeError, readExpenseWithoutChargeSession, resolveExpenseWithoutCharge,
  storeExpenseWithoutChargeAttempt, type ExpenseWithoutChargeAttempt,
} from '../despesas-sem-cobranca.service';

export function useDespesaWithoutCharge(sourceId: string, version: number, onResolved: () => Promise<void>, resolved = false) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState<ExpenseWithoutChargeAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const storageKey = useRef('');
  const requestId = useRef(generateSafeUuid());
  const inFlight = useRef(false);
  const mutation = useMutation({ mutationFn: resolveExpenseWithoutCharge });
  useEffect(() => {
    let active = true;
    void readExpenseWithoutChargeSession(sourceId).then(session => {
      if (!active) return;
      storageKey.current = session.key;
      if (session.attempt) { setSubmitted(session.attempt); setReason(session.attempt.reason); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível conferir a sessão.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceId]);

  const confirm = async () => {
    if (inFlight.current || loading || !storageKey.current || resolved && !submitted) return;
    const attempt = submitted || { requestId: requestId.current, sourceId, version, reason: reason.trim() };
    inFlight.current = true; setPending(true); setError('');
    try {
      const session = await readExpenseWithoutChargeSession(sourceId);
      if (session.key !== storageKey.current) throw new ExpenseWithoutChargeError('A sessão mudou. Feche e abra este lançamento novamente.');
      setSubmitted(attempt);
      setStorageWarning(!storeExpenseWithoutChargeAttempt(storageKey.current, attempt));
      await mutation.mutateAsync(attempt);
      await onResolved();
      storeExpenseWithoutChargeAttempt(storageKey.current, null);
    } catch (cause) {
      if (cause instanceof ExpenseWithoutChargeError && cause.safeToEdit) {
        storeExpenseWithoutChargeAttempt(storageKey.current, null); setSubmitted(null);
        requestId.current = generateSafeUuid();
      }
      setError(cause instanceof Error ? cause.message : 'Encerramento ainda não confirmado. Confira esta mesma tentativa.');
    } finally { inFlight.current = false; setPending(false); }
  };
  return { reason, setReason, submitted, loading, pending, error, storageWarning, confirm,
    readOnly: resolved && !submitted, locked: loading || pending || Boolean(submitted),
    canConfirm: !loading && !pending && Boolean(storageKey.current) && (!resolved || Boolean(submitted)) };
}
