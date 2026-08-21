import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router';
import { loginService } from '../../login/login.service';
import { supabase } from '../../../lib/supabase';
import {
  clearPortalSession,
  getPortalProfile,
  type PortalAuthProfile,
} from '../../login/portal-session';
import { getAlunoRejectedSessionPath } from '../aluno-logout-route';

const AUTH_CHECK_TIMEOUT_MS = 8_000;

const withAuthTimeout = <T,>(request: PromiseLike<T>) => Promise.race([
  Promise.resolve(request),
  new Promise<T>((_, reject) => {
    window.setTimeout(() => reject(new Error('AUTH_CHECK_TIMEOUT')), AUTH_CHECK_TIMEOUT_MS);
  }),
]);

const buildLoginRedirect = () => {
  const currentPath = window.location.pathname + window.location.search;
  return getAlunoRejectedSessionPath(Capacitor.isNativePlatform(), currentPath);
};

const buildFirstAccessRedirect = (contextId: string) => {
  const currentPath = window.location.pathname + window.location.search;
  const firstAccessParams = new URLSearchParams({
    next: currentPath,
    context: contextId,
  });
  return `/aluno/primeiro-acesso?${firstAccessParams.toString()}`;
};

export const useAlunoPortalProfile = () => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [retrySignal, setRetrySignal] = useState(0);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let mounted = true;

    const rejectSession = () => {
      clearPortalSession();
      if (mounted) navigateRef.current(buildLoginRedirect(), { replace: true });
      // O redirecionamento para o login não pode depender da rede. A revogação
      // global pode demorar ou ficar indisponível; a sessão local já foi limpa.
      void loginService.logout().catch(() => undefined);
    };

    const hydrateProfile = async () => {
      setIsAuthLoading(true);
      setConnectionError(false);
      try {
        // A ausência de sessão é conhecida localmente e deve redirecionar sem
        // depender da internet. Quando existe sessão, getUser continua sendo a
        // validação autoritativa no servidor, agora com limite de espera.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          rejectSession();
          return;
        }

        const { data: authData, error: authError } = await withAuthTimeout(supabase.auth.getUser());
        if (authError || !authData.user) {
          const status = Number((authError as { status?: number } | null)?.status || 0);
          const sessionIsMissing = authError?.name === 'AuthSessionMissingError' || status === 401;
          if (sessionIsMissing || (!authError && !authData.user)) {
            rejectSession();
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
          rejectSession();
          return;
        }

        const hasAcceptedTerms = Boolean(portalProfile.acceptedTermsAt?.trim());
        const hasCompletedPasswordReset = portalProfile.requiresPasswordReset === false;
        if (!hasAcceptedTerms || !hasCompletedPasswordReset) {
          clearPortalSession();
          if (!portalProfile.contextId) {
            rejectSession();
            return;
          }
          navigateRef.current(buildFirstAccessRedirect(portalProfile.contextId), { replace: true });
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
  }, [retrySignal]);

  return {
    profile,
    isAuthLoading,
    isAuthorized: Boolean(profile) && !isAuthLoading,
    connectionError,
    retry: () => setRetrySignal((value) => value + 1),
  };
};
