import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginService } from '../../login/login.service';
import {
  clearPortalSession,
  getPortalProfile,
  type PortalAuthProfile,
} from '../../login/portal-session';

const buildLoginRedirect = () => {
  const currentPath = window.location.pathname + window.location.search;
  return `/login?redirect=${encodeURIComponent(currentPath)}`;
};

export const useAlunoPortalProfile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const rejectSession = async () => {
      clearPortalSession();
      await loginService.logout().catch(() => undefined);
      if (mounted) navigate(buildLoginRedirect(), { replace: true });
    };

    const hydrateProfile = async () => {
      try {
        const portalProfile = await getPortalProfile({
          preferredRole: 'Aluno',
          allowedRoles: ['Aluno'],
        });
        if (!mounted) return;

        if (!portalProfile || portalProfile.tipo !== 'Aluno') {
          await rejectSession();
          return;
        }

        setProfile(portalProfile);
      } catch {
        await rejectSession();
      } finally {
        if (mounted) setIsAuthLoading(false);
      }
    };

    void hydrateProfile();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return {
    profile,
    isAuthLoading,
    isAuthorized: Boolean(profile) && !isAuthLoading,
  };
};
