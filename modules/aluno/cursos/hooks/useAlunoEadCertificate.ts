import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../../shared/realtime/realtime-invalidation';
import { portalRealtimeSignalFilter, portalRealtimeTopics } from '../../../shared/realtime/portal-realtime-signals';
import { getAlunoEadCertificate } from '../ead-certificate.service';

export const useAlunoEadCertificate = (
  alunoId: string | undefined, cursoId: string | undefined, certificateId: string | null | undefined, enabled: boolean,
) => {
  const queryClient = useQueryClient();
  const allowed = enabled && Boolean(alunoId && cursoId && certificateId);
  useEffect(() => {
    if (!allowed) return undefined;
    const invalidation = createRealtimeInvalidationController({ invalidate: () => {
      void queryClient.invalidateQueries({ queryKey: ['aluno-certificado-ead', alunoId || '', cursoId || '', certificateId || ''], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['aluno-ead-certificate-model', alunoId || '', certificateId || ''], exact: true });
    } });
    const channel = supabase.channel(`aluno_certificate_identity_${alunoId}_${certificateId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificados_academicos', filter: `id=eq.${certificateId}` }, invalidation.schedule)
      .on('postgres_changes', portalRealtimeSignalFilter(portalRealtimeTopics.studentCourseAccess(alunoId!)), invalidation.schedule)
      .subscribe(invalidation.onChannelStatus);
    const visible = () => { if (document.visibilityState === 'visible') invalidation.schedule(); };
    window.addEventListener('focus', invalidation.schedule);
    document.addEventListener('visibilitychange', visible);
    return () => {
      invalidation.dispose(); void supabase.removeChannel(channel);
      window.removeEventListener('focus', invalidation.schedule);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [allowed, alunoId, certificateId, cursoId, queryClient]);
  return useQuery({
  queryKey: ['aluno-certificado-ead', alunoId || '', cursoId || '', certificateId || ''],
  enabled: allowed,
  queryFn: () => getAlunoEadCertificate(alunoId!, cursoId!, certificateId!),
  retry: false,
  refetchInterval: query => query.state.data ? false : 30_000,
  });
};
