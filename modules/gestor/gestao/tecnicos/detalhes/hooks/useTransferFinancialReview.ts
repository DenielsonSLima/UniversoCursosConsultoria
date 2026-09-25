import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { transferFinanceService } from '../transfer-finance.service';
import type { TransferFinancialResult, TransferIntent } from '../transfer-finance.contract';
import { TransferFinancialAttempt, type TransferFinancialAttemptInput } from './transfer-financial-attempt';

export function useTransferFinancialReview(input: TransferIntent | null, options: {
  onSuccess: (result: TransferFinancialResult, input: TransferIntent) => Promise<void> | void;
  onError: (error: Error) => void;
}) {
  const attempt = useRef(new TransferFinancialAttempt());
  const [locked, setLocked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (input === null && !attempt.current.busy && !attempt.current.uncertain) {
      attempt.current = new TransferFinancialAttempt();
      setLocked(false);
      setConfirmed(false);
    }
  }, [input]);
  const query = useQuery({
    queryKey: ['transfer-finance-preview', input?.matriculaId, input?.tipo, input?.dataTransferencia, input?.turmaDestinoId],
    queryFn: () => transferFinanceService.preview(input!),
    enabled: Boolean(input?.dataTransferencia && (input.tipo === 'EXTERNA_ENVIADA' || input.turmaDestinoId)) && !locked,
    staleTime: 0, retry: false,
  });
  const mutation = useMutation({
    mutationFn: (draft: TransferFinancialAttemptInput) => transferFinanceService.confirm(draft),
    retry: false,
  });
  const confirm = async () => {
    if (attempt.current.busy || attempt.current.confirmed || mutation.isPending) return;
    if (!attempt.current.hasInput && (!input || !query.data || query.isError || query.isFetching)) return;
    setLocked(true);
    let submitted!: TransferFinancialAttemptInput;
    try {
      const result = await attempt.current.run(
        () => ({ ...input!, requestId: crypto.randomUUID(), fingerprint: query.data!.fingerprint }),
        (draft) => { submitted = draft; return mutation.mutateAsync(draft); },
      );
      if (!result) return;
      setConfirmed(true);
      setLocked(false);
      try { await options.onSuccess(result, submitted); }
      catch {
        options.onError(new Error('Transferência registrada. A atualização da tela falhou; recarregue para conferir o resultado.'));
      }
    } catch (error) {
      setLocked(attempt.current.uncertain);
      if (!attempt.current.hasInput) void query.refetch();
      options.onError(error as Error);
    }
  };
  const canReplay = attempt.current.hasInput && attempt.current.uncertain;
  return { query, mutation, confirm, locked, canReplay,
    canConfirm: !confirmed && !mutation.isPending
      && (canReplay || Boolean(query.data && !query.isError && !query.isFetching)) };
}
