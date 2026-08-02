import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginService } from '../../login/login.service';
import { supabase } from '../../../lib/supabase';
import {
  clearPortalSession,
  getPortalProfile,
  type PortalAuthProfile,
} from '../../login/portal-session';

const buildLoginRedirect = () => {
  const currentPath = window.location.pathname + window.location.search;
  const params = new URLSearchParams({
    reason: 'session_expired',
    redirect: currentPath,
  });
  return `/aluno/login-app?${params.toString()}`;
};

export const useAlunoPortalProfile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [retrySignal, setRetrySignal] = useState(0);

  useEffect(() => {
    let mounted = true;

    const rejectSession = async () => {
      clearPortalSession();
      await loginService.logout().catch(() => undefined);
      if (mounted) navigate(buildLoginRedirect(), { replace: true });
    };

    const hydrateProfile = async () => {
      setIsAuthLoading(true);
      setConnectionError(false);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          const status = Number((authError as { status?: number } | null)?.status || 0);
          const sessionIsMissing = authError?.name === 'AuthSessionMissingError' || status === 401;
          if (sessionIsMissing || (!authError && !authData.user)) {
            await rejectSession();
            return;
          }
          if (mounted) setConnectionError(true);
          return;
        }

        const portalProfile = await getPortalProfile({
          preferredRole: 'Aluno',
          allowedRoles: ['Aluno'],
          authenticatedUser: authData.user,
        });
        if (!mounted) return;

        if (!portalProfile || portalProfile.tipo !== 'Aluno') {
          await rejectSession();
          return;
        }

        setProfile(portalProfile);
      } catch {
        if (mounted) setConnectionError(true);
      } finally {
        if (mounted) setIsAuthLoading(false);
      }
    };

    void hydrateProfile();

    return () => {
      mounted = false;
    };
  }, [navigate, retrySignal]);

  return {
    profile,
    isAuthLoading,
    isAuthorized: Boolean(profile) && !isAuthLoading,
    connectionError,
    retry: () => setRetrySignal((value) => value + 1),
  };
};
