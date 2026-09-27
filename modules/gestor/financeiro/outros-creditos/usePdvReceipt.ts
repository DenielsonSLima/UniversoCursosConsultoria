import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PdvReceiptActionState } from './PdvReceiptActions';
import { openPreparedPdvReceipt, preparePdvReceipt, printPreparedPdvReceipt } from './pdv-receipt.service';

export function usePdvReceipt(receivableId: string, paid: boolean) {
  const [state, setState] = useState<PdvReceiptActionState>('ready');
  const [error, setError] = useState<string | null>(null);
  const [reprintReason, setReprintReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const printing = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const query = useQuery({
    queryKey: ['pdv-receipt', receivableId], enabled: paid,
    queryFn: () => preparePdvReceipt(receivableId),
    retry: false, staleTime: Infinity, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const print = async () => {
    if (!query.data || printing.current) return;
    printing.current = true;
    setState('printing'); setError(null);
    try {
      const outcome = await printPreparedPdvReceipt(query.data, {
        reprintReason: query.data.receipt.hasPriorPrint || submitted ? reprintReason : undefined,
      });
      if (alive.current) setSubmitted(true);
      if (alive.current) setState(outcome === 'UNKNOWN' ? 'unknown' : outcome === 'ACCEPTED' ? 'accepted' : 'dialog-opened');
      return alive.current && outcome !== 'UNKNOWN';
    } catch (cause) {
      if (alive.current) { setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a impressão.'); setState('error'); }
      if (alive.current) void query.refetch();
      return false;
    } finally { printing.current = false; }
  };
  const open = () => {
    if (!query.data) return;
    try { openPreparedPdvReceipt(query.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o comprovante.'); setState('error'); }
  };
  return {
    query, print, open, reprintReason, setReprintReason,
    requiresReprint: submitted || query.data?.receipt.hasPriorPrint === true,
    state: query.isPending || query.isFetching ? 'preparing' as const : query.isError ? 'error' as const : state,
    error: query.error?.message || error,
    retry: () => { setError(null); setState('ready'); void query.refetch(); },
  };
}
