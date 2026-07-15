import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { loginService } from '../login/login.service';
import { clearPortalSession, getPortalProfile, getPortalSessionFromStorage, PortalAuthProfile } from '../login/portal-session';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import ConfirmModal from '../shared/components/ConfirmModal';

// Sub-módulos do Professor
import InicioPage from './inicio/InicioPage';
import TurmasPage from './turmas/TurmasPage';
import FinanceiroPage from './financeiro/FinanceiroPage';
import BibliotecaPage from './biblioteca/BibliotecaPage';
import ComunicacaoPage from './comunicacao/ComunicacaoPage';
import PerfilPage from './perfil/PerfilPage';
import CalendarioProfessorPage from './calendario/CalendarioProfessorPage';
import ProfessorShell, { ProfessorPolo } from './components/ProfessorShell';

const ProfessorPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const storedProfile = getPortalSessionFromStorage();
  const initialProfessorProfile = storedProfile?.tipo === 'Professor' ? storedProfile : null;
  const [activeModule, setActiveModule] = useState('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentPoloId, setCurrentPoloId] = useState<string | null>(null);
  const [isPoloSelectorOpen, setIsPoloSelectorOpen] = useState(false);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(initialProfessorProfile);
  // O cache local serve apenas para a tela de espera. O escopo de polos só é
  // liberado depois que o perfil autoritativo for hidratado no Supabase.
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const scrollContentToTop = useCallback(() => {
    requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, []);

  // Força o scroll para o topo ao trocar de módulo/página
  useEffect(() => {
    scrollContentToTop();
  }, [activeModule, scrollContentToTop]);

  const professorId = profile?.id || '';
  const professorNome = profile?.nome || '';
  const professorEmail = profile?.email || '';

  useEffect(() => {
    let mounted = true;

    const hydrateProfile = async () => {
      try {
        const portalProfile = await getPortalProfile({ preferredRole: 'Professor', allowedRoles: ['Professor'] });
        if (!mounted) return;

        if (!portalProfile || portalProfile.tipo !== 'Professor') {
          clearPortalSession();
          await loginService.logout().catch(() => undefined);
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          navigate(`/sistema/login?redirect=${redirect}`, { replace: true });
          return;
        }

        const allowedPolos = (portalProfile.poloIds || []).filter(Boolean);
        const preferredPolo = portalProfile.activePoloId
          && allowedPolos.includes(portalProfile.activePoloId)
          ? portalProfile.activePoloId
          : allowedPolos[0] || null;

        setCurrentPoloId(preferredPolo || null);
        setProfile(portalProfile);
      } catch {
        clearPortalSession();
        await loginService.logout().catch(() => undefined);
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        navigate(`/sistema/login?redirect=${redirect}`, { replace: true });
      } finally {
        if (mounted) setIsAuthLoading(false);
      }
    };

    hydrateProfile();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Fetch active polos for seletor
  const professorPoloIds = (profile?.poloIds || []).filter(Boolean).sort();
  const { data: activePolos = [], isLoading: isLoadingActivePolos } = useQuery<ProfessorPolo[]>({
    queryKey: ['professor-active-polos', profile?.id, professorPoloIds],
    enabled: Boolean(profile && !isAuthLoading),
    queryFn: async () => {
      if (professorPoloIds.length === 0) return [];

      const { data, error } = await supabase
        .from('polos')
        .select('*')
        .in('id', professorPoloIds)
        .eq('status', 'ativo')
        .order('nome', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  // Redireciona apenas depois da autenticação se o professor não tiver polo ativo.
  useEffect(() => {
    if (isAuthLoading || !profile) return;
    if (isLoadingActivePolos) return;
    if (currentPoloId && activePolos.some((polo) => polo.id === currentPoloId)) return;

    const fallbackPoloId = activePolos[0]?.id || null;
    if (fallbackPoloId) {
      setCurrentPoloId(fallbackPoloId);
      sessionStorage.setItem('active_polo_id', fallbackPoloId);
      return;
    }

    navigate('/sistema/login');
  }, [activePolos, currentPoloId, isAuthLoading, isLoadingActivePolos, navigate, profile]);

  const currentPolo = activePolos.find((polo) => polo.id === currentPoloId) || null;

  const handlePoloChange = (poloId: string) => {
    setCurrentPoloId(poloId);
    sessionStorage.setItem('active_polo_id', poloId);
    setIsPoloSelectorOpen(false);
    // Invalidate related queries
    queryClient.invalidateQueries();
  };

  const executeLogout = async () => {
    await loginService.logout();
    sessionStorage.removeItem('logged_user_id');
    sessionStorage.removeItem('logged_user_name');
    sessionStorage.removeItem('logged_user_email');
    sessionStorage.removeItem('logged_user_tipo');
    clearPortalSession();
    sessionStorage.removeItem('active_polo_id');
    navigate('/sistema/login');
  };

  useInactivityLogout({
    isEnabled: !!profile && !isAuthLoading,
    onTimeout: executeLogout,
  });

  if (isAuthLoading || !profile) {
    return <AccessCheckingScreen portal="Professor" />;
  }

  const handleLogout = async () => {
    setIsLogoutConfirmOpen(true);
  };

  const renderContent = () => {
    switch (activeModule) {
      case 'inicio':
        return <InicioPage professorId={professorId} professorNome={professorNome} poloId={currentPoloId} onNavigate={setActiveModule} />;
      case 'turmas':
        return (
          <TurmasPage
            key={currentPoloId || 'sem-polo'}
            professorId={professorId}
            poloId={currentPoloId || ''}
          />
        );
      case 'financeiro':
        return <FinanceiroPage professorId={professorId} />;
      case 'calendario':
        return <CalendarioProfessorPage professorId={professorId} />;
      case 'biblioteca':
        return <BibliotecaPage professorId={professorId} />;
      case 'comunicacao':
        return <ComunicacaoPage professorId={professorId} professorNome={professorNome} />;
      case 'perfil':
        return <PerfilPage professorId={professorId} />;
      default:
        return <InicioPage professorId={professorId} professorNome={professorNome} onNavigate={setActiveModule} />;
    }
  };

  return (
    <>
      <ProfessorShell
        activeModule={activeModule}
        activePolos={activePolos}
        contentScrollRef={contentScrollRef}
        currentPolo={currentPolo}
        currentPoloId={currentPoloId}
        isMobileMenuOpen={isMobileMenuOpen}
        isPoloSelectorOpen={isPoloSelectorOpen}
        professorEmail={professorEmail}
        professorNome={professorNome}
        onLogout={handleLogout}
        onModuleChange={setActiveModule}
        onMobileMenuChange={setIsMobileMenuOpen}
        onPoloChange={handlePoloChange}
        onPoloSelectorChange={setIsPoloSelectorOpen}
      >
        {renderContent()}
      </ProfessorShell>

      <ConfirmModal
        isOpen={isLogoutConfirmOpen}
        title="Confirmação"
        message="Deseja realmente sair?"
        confirmText="Sair"
        cancelText="Cancelar"
        variant="danger"
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={executeLogout}
      />
    </>
  );
};

export default ProfessorPage;
