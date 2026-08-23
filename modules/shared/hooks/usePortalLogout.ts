import { useCallback, useEffect, useRef } from 'react';
import type { SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { loginService } from '../../login/login.service';
import { clearPortalSession } from '../../login/portal-session';

interface UsePortalLogoutOptions {
  loginPath: '/' | '/login' | '/aluno/entrar' | '/aluno/login-app' | '/sistema/login';
}

const QUERY_CACHE_AUTH_UID_KEY = 'portal_query_cache_auth_uid';
type PortalLogoutTrigger = 'inactivity' | SyntheticEvent;

export const usePortalLogout = ({ loginPath }: UsePortalLogoutOptions) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isLoggingOutRef = useRef(false);

  const redirectToLogin = useCallback(() => {
    try {
      queryClient.clear();
      sessionStorage.removeItem(QUERY_CACHE_AUTH_UID_KEY);
      clearPortalSession();
    } finally {
      navigate(loginPath, { replace: true });
    }
  }, [loginPath, navigate, queryClient]);

  const logout = useCallback((trigger?: PortalLogoutTrigger) => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    // A interface sai da área protegida antes da chamada remota. Assim, uma
    // rede lenta não deixa o portal montado sem dados enquanto o token é revogado.
    redirectToLogin();
    const scope = trigger === 'inactivity' ? 'local' : 'global';
    void loginService.logout(scope).catch((error) => {
      console.warn('Não foi possível confirmar o encerramento da sessão.', error);
    });
  }, [redirectToLogin]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUid = session?.user?.id || null;
      const cachedUid = sessionStorage.getItem(QUERY_CACHE_AUTH_UID_KEY);

      if (nextUid && cachedUid && nextUid !== cachedUid) {
        queryClient.clear();
      }
      if (nextUid) {
        sessionStorage.setItem(QUERY_CACHE_AUTH_UID_KEY, nextUid);
      }
      if (event === 'SIGNED_OUT') redirectToLogin();
    });

    return () => authListener.subscription.unsubscribe();
  }, [queryClient, redirectToLogin]);

  return logout;
};
