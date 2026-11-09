import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import type { PortalAuthProfile } from '../../../login/portal-session';
import { canAccessGestorModule } from '../../access-control';
import { getNfseAccess } from './nfse-access.service';
import { isNfseAccessIdentity, nfseAccessQueryKey, resolveNfsePilotAccessState } from './nfse-access.contract';

export function useNfsePilotAccess(profile: PortalAuthProfile | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const identity = { authUserId: profile?.authUserId || '', contextId: profile?.contextId || '' };
  const eligible = enabled && isNfseAccessIdentity(identity)
    && sessionUserId === identity.authUserId
    && Boolean(profile?.gestorPermissions
      && canAccessGestorModule(profile.gestorPermissions, 'emissor-nfse'));

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user.id || null);
      // Never carry a prior user's decision through a session replacement.
      setTimeout(() => { void queryClient.invalidateQueries({ queryKey: ['nfse-pilot-access'] }); }, 0);
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const query = useQuery({
    queryKey: nfseAccessQueryKey(identity),
    queryFn: ({ signal }) => getNfseAccess(identity, signal),
    enabled: eligible,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  // A background revalidation keeps only this identity's last successful decision.
  return resolveNfsePilotAccessState(identity, eligible, query);
}
