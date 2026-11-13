import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../../shared/realtime/realtime-invalidation';
import { portalRealtimeSignalFilter, portalRealtimeTopics } from '../../../shared/realtime/portal-realtime-signals';
import { eadCertificateDeliveryService, isEadCertificateDeliveryAllowed } from '../ead-certificate-delivery.service';

export const useEadCertificateDelivery = (
  alunoId: string | undefined, certificateId: string | undefined, code: string | undefined, enabled: boolean,
) => {
  const queryClient = useQueryClient();
  const allowedToRead = enabled && Boolean(alunoId && certificateId && code);
  const binding = `${alunoId || ''}:${certificateId || ''}:${code || ''}:${allowedToRead}`;
  const currentBinding = useRef(binding);
  currentBinding.current = binding;
  const mounted = useRef(true);
  const checkingRef = useRef<{ binding: string; promise: Promise<boolean> } | null>(null);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState('');
  const [now, setNow] = useState(Date.now);
  const queryKey = ['aluno-ead-certificate-delivery', alunoId || '', certificateId || '', code || ''] as const;
  const query = useQuery({ queryKey,
    queryFn: ({ signal }) => eadCertificateDeliveryService.get(certificateId!, signal), enabled: allowedToRead,
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always',
    refetchInterval: current => current.state.data?.state === 'TEMPORARY' ? 30_000 : false,
  });
  const refresh = useCallback(() => {
    if (allowedToRead) void queryClient.invalidateQueries({
      queryKey: ['aluno-ead-certificate-delivery', alunoId || '', certificateId || '', code || ''], exact: true,
    });
  }, [allowedToRead, alunoId, certificateId, code, queryClient]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; currentBinding.current = ''; };
  }, []);
  useEffect(() => { setChecking(false); setActionError(''); setNow(Date.now()); }, [binding]);
  const deadlineMs = query.data?.state === 'TEMPORARY' ? Date.parse(query.data.deadline || '') : Number.NaN;
  useEffect(() => {
    if (!Number.isFinite(deadlineMs)) return undefined;
    const currentTime = Date.now();
    setNow(currentTime);
    const remaining = deadlineMs - currentTime;
    if (remaining <= 0) return undefined;
    const timer = window.setTimeout(() => { setNow(Date.now()); refresh(); }, Math.min(remaining + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [deadlineMs, refresh]);
  useEffect(() => {
    if (!allowedToRead) return undefined;
    const invalidation = createRealtimeInvalidationController({ invalidate: refresh });
    const channel = supabase.channel(`aluno_certificate_delivery_${alunoId}_${certificateId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificados_academicos', filter: `id=eq.${certificateId}` }, invalidation.schedule)
      .on('postgres_changes', portalRealtimeSignalFilter(portalRealtimeTopics.studentCourseAccess(alunoId!)), invalidation.schedule)
      .subscribe(invalidation.onChannelStatus);
    const resume = () => { setNow(Date.now()); invalidation.schedule(); };
    const visible = () => { if (document.visibilityState === 'visible') resume(); };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visible);
      invalidation.dispose(); void supabase.removeChannel(channel);
    };
  }, [allowedToRead, alunoId, certificateId, refresh]);
  const authorizeFresh = async (): Promise<boolean> => {
    if (!allowedToRead || !mounted.current || currentBinding.current !== binding) return false;
    if (checkingRef.current?.binding === binding) return checkingRef.current.promise;
    setChecking(true); setActionError('');
    const promise = (async () => {
      try {
        await queryClient.cancelQueries({ queryKey, exact: true }, { silent: true });
        if (!mounted.current || currentBinding.current !== binding) return false;
        const state = await queryClient.fetchQuery({ queryKey, staleTime: 0, gcTime: 0, retry: false,
          queryFn: ({ signal }) => eadCertificateDeliveryService.get(certificateId!, signal) });
        if (!mounted.current || currentBinding.current !== binding) return false;
        setNow(Date.now());
        if (!isEadCertificateDeliveryAllowed(state, code || '')) {
          setActionError('A liberação deste certificado mudou ou terminou. Aguarde a confirmação do pagamento ou consulte a secretaria.');
          return false;
        }
        return true;
      } catch {
        if (mounted.current && currentBinding.current === binding) setActionError('Não foi possível conferir a liberação do certificado. Tente novamente.');
        return false;
      } finally {
        if (mounted.current && currentBinding.current === binding) setChecking(false);
        if (checkingRef.current?.binding === binding) checkingRef.current = null;
      }
    })();
    checkingRef.current = { binding, promise };
    return promise;
  };
  const allowed = allowedToRead && !query.isError && query.isFetchedAfterMount
    && isEadCertificateDeliveryAllowed(query.data, code || '', Math.max(now, query.dataUpdatedAt));
  const loading = allowedToRead && (query.isPending || !query.isFetchedAfterMount);
  const message = actionError || (query.isError ? 'Não foi possível conferir a liberação do certificado.'
    : allowedToRead && !loading && !allowed ? 'Certificado indisponível: o prazo terminou ou a liberação foi alterada.' : '');
  return { allowed, loading, checking, message, authorizeFresh };
};
