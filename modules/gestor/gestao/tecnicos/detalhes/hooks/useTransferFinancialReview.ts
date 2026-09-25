import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { transferFinanceService } from '../transfer-finance.service';
import type { TransferFinancialResult, TransferIntent } from '../transfer-finance.contract';

type Attempt = TransferIntent & { requestId: string; fingerprint: string };
export function useTransferFinancialReview(input: TransferIntent | null, options: {
  onSuccess: (result: TransferFinancialResult, input: TransferIntent) => Promise<void> | void;
  onError: (error: Error) => void;
}) {
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false);
  const [locked, setLocked] = useState(false);
  const query = useQuery({
    queryKey: ['transfer-finance-preview', input?.matriculaId, input?.tipo, input?.dataTransferencia, input?.turmaDestinoId],
    queryFn: () => transferFinanceService.preview(input!),
    enabled: Boolean(input?.dataTransferencia && (input.tipo === 'EXTERNA_ENVIADA' || input.turmaDestinoId)) && !locked,
    staleTime: 0, retry: false,
  });
  const mutation = useMutation({
    mutationFn: (draft: Attempt) => transferFinanceService.confirm(draft),
    onSuccess: async (result, draft) => {
      attempt.current = null;
      setLocked(false);
      await options.onSuccess(result, draft);
    },
    onError: (error: Error & { code?: string }) => {
      // These database errors explicitly rolled the transaction back. A lost
      // response keeps the same request and reviewed payload for safe replay.
      if (['40001', '22023', '23514', '42501', 'P0001', '23505', '55P03'].includes(error.code || '')) {
        attempt.current = null;
        setLocked(false);
        void query.refetch();
      }
      options.onError(error);
    },
    onSettled: () => { inFlight.current = false; },
  });
  const confirm = () => {
    if (inFlight.current || mutation.isPending) return;
    if (attempt.current) { inFlight.current = true; mutation.mutate(attempt.current); return; }
    if (!input || !query.data || query.isError || query.isFetching) return;
    attempt.current = { ...input, requestId: crypto.randomUUID(), fingerprint: query.data.fingerprint };
    inFlight.current = true;
    setLocked(true);
    mutation.mutate(attempt.current);
  };
  return { query, mutation, confirm, locked,
    canConfirm: !mutation.isPending && (locked || Boolean(query.data && !query.isError && !query.isFetching)) };
}
