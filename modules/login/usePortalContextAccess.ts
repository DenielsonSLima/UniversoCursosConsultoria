import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { loginService } from './login.service';
import {
  clearPortalSession,
  getPortalProfile,
  type PortalAuthProfile,
} from './portal-session';
import {
  resolvePortalContextAccess,
  type PortalAccessRole,
} from './portal-context-access';
import { buildPortalFirstAccessPath, requiresPortalFirstAccess } from './portal-first-access';

/**
 * Guarda de portais novos, baseada em contexto reidratado da RPC. O storage
 * pode melhorar a transição visual, mas nunca determina o acesso desta guarda.
 */
export const usePortalContextAccess = (role: PortalAccessRole) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setConnectionError(false);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new window.AbortController();

    const hydrate = async () => {
      setIsLoading(true);
      setConnectionError(false);
      setProfile(null);
      const redirectToLogin = () => {
        queryClient.clear();
        clearPortalSession();
        const redirect = encodeURIComponent(
          window.location.pathname + window.location.search + window.location.hash,
        );
        const loginPath = role === 'Responsavel' ? '/login' : '/sistema/login';
        navigate(`${loginPath}?redirect=${redirect}`, { replace: true });
        void loginService.logout().catch(() => undefined);
      };

      const resolution = await resolvePortalContextAccess({
        role,
        signal: controller.signal,
        getUser: () => supabase.auth.getUser(),
        getProfile: (authenticatedUser) => getPortalProfile({
          preferredRole: role,
          allowedRoles: [role],
          authenticatedUser,
        }),
      });
      if (controller.signal.aborted || resolution.status === 'cancelled') return;

      try {
        if (resolution.status === 'unauthorized') {
          redirectToLogin();
          return;
        }
        if (resolution.status === 'transient-error') {
          // Mantém sessão e cache intactos, mas nenhum conteúdo protegido é
          // liberado enquanto os serviços autoritativos estiverem indisponíveis.
          setConnectionError(true);
          return;
        }

        const resolved = resolution.profile;
        if (role === 'Responsavel' && requiresPortalFirstAccess(resolved)) {
          clearPortalSession();
          const next = window.location.pathname + window.location.search + window.location.hash;
          navigate(
            buildPortalFirstAccessPath('Responsavel', resolved.contextId, next),
            { replace: true },
          );
          return;
        }
        setProfile(resolved);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void hydrate();
    return () => {
      controller.abort();
    };
  }, [attempt, navigate, queryClient, role]);

  return { profile, isLoading, connectionError, retry };
};
