import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { loginService } from '../../login/login.service';
import { clearPortalSession } from '../../login/portal-session';

interface UsePortalLogoutOptions {
  loginPath: '/login' | '/sistema/login';
}

export const usePortalLogout = ({ loginPath }: UsePortalLogoutOptions) => {
  const navigate = useNavigate();
  const isLoggingOutRef = useRef(false);

  const redirectToLogin = useCallback(() => {
    try {
      clearPortalSession();
    } finally {
      navigate(loginPath, { replace: true });
    }
  }, [loginPath, navigate]);

  const logout = useCallback(() => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    // A interface sai da área protegida antes da chamada remota. Assim, uma
    // rede lenta não deixa o portal montado sem dados enquanto o token é revogado.
    redirectToLogin();
    void loginService.logout().catch((error) => {
      console.warn('A sessão local foi encerrada, mas a revogação global não foi concluída.', error);
    });
  }, [redirectToLogin]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') redirectToLogin();
    });

    return () => authListener.subscription.unsubscribe();
  }, [redirectToLogin]);

  return logout;
};
