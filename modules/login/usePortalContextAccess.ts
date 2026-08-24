import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { loginService } from './login.service';
import {
  clearPortalSession,
  getPortalProfile,
  type PortalAuthProfile,
} from './portal-session';
import type { PortalRole } from './portal-context.contract';
import { buildPortalFirstAccessPath, requiresPortalFirstAccess } from './portal-first-access';

const AUTH_CHECK_TIMEOUT_MS = 8_000;

const withAuthTimeout = <T,>(request: PromiseLike<T>) => Promise.race([
  Promise.resolve(request),
  new Promise<T>((_, reject) => {
    window.setTimeout(() => reject(new Error('AUTH_CHECK_TIMEOUT')), AUTH_CHECK_TIMEOUT_MS);
  }),
]);

const isDefinitiveAuthFailure = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const source = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof source.code === 'string' ? source.code.toLowerCase() : '';
  const message = typeof source.message === 'string' ? source.message.toLowerCase() : '';
  return [
    'session_not_found',
    'refresh_token_not_found',
    'bad_jwt',
    'user_not_found',
  ].includes(code)
    || message.includes('auth session missing')
    || message.includes('refresh token not found');
};

/**
 * Guarda de portais novos, baseada em contexto reidratado da RPC. O storage
 * pode melhorar a transição visual, mas nunca determina o acesso desta guarda.
 */
export const usePortalContextAccess = (role: Extract<PortalRole, 'Responsavel' | 'Coordenador'>) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setConnectionError(false);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      setIsLoading(true);
      setConnectionError(false);
      setProfile(null);
      const redirectToLogin = () => {
        clearPortalSession();
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        const loginPath = role === 'Coordenador' ? '/sistema/login' : '/login';
        navigate(`${loginPath}?redirect=${redirect}`, { replace: true });
        void loginService.logout().catch(() => undefined);
      };
      try {
        // Distingue sessão realmente inválida de indisponibilidade de rede. Sem
        // esta etapa, `getPortalProfile` reduz qualquer falha de `getUser` a
        // perfil ausente e uma oscilação transitória acabaria destruindo a sessão.
        const { data: authData, error: authError } = await withAuthTimeout(supabase.auth.getUser());
        if (authError) throw authError;
        if (!authData.user) {
          if (!mounted) return;
          redirectToLogin();
          return;
        }

        const resolved = await withAuthTimeout(getPortalProfile({
          preferredRole: role,
          allowedRoles: [role],
          authenticatedUser: authData.user,
        }));
        if (!mounted) return;
        if (!resolved || resolved.tipo !== role || !resolved.contextId) {
          redirectToLogin();
          return;
        }
        if (role === 'Responsavel' && requiresPortalFirstAccess(resolved)) {
          clearPortalSession();
          const next = window.location.pathname + window.location.search;
          navigate(
            buildPortalFirstAccessPath('Responsavel', resolved.contextId, next),
            { replace: true },
          );
          return;
        }
        setProfile(resolved);
      } catch (error) {
        if (isDefinitiveAuthFailure(error)) {
          if (mounted) redirectToLogin();
          return;
        }
        // A autorização continua fechada porque `profile` permanece nulo, mas
        // uma falha de rede não apaga uma sessão que pode continuar válida.
        if (mounted) {
          setProfile(null);
          setConnectionError(true);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void hydrate();
    return () => {
      mounted = false;
    };
  }, [attempt, navigate, role]);

  return { profile, isLoading, connectionError, retry };
};
