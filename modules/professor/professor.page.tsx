import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { loginService } from '../login/login.service';
import { clearPortalSession, getPortalProfile, getPortalSessionFromStorage, PortalAuthProfile } from '../login/portal-session';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import { usePortalLogout } from '../shared/hooks/usePortalLogout';
import ConfirmModal from '../shared/components/ConfirmModal';
import PoloTransitionOverlay, {
  PoloTransitionStatus,
} from '../shared/components/PoloTransitionOverlay';
import { waitForActivePoloQueries } from '../shared/utils/poloTransitionQueries';
import { professorDashboardQueryOptions } from './hooks/useProfessorDashboard';

// Sub-módulos do Professor
import ProfessorShell, { ProfessorPolo } from './components/ProfessorShell';

const InicioPage = lazy(() => import('./inicio/InicioPage'));
const TurmasPage = lazy(() => import('./turmas/TurmasPage'));
const FinanceiroPage = lazy(() => import('./financeiro/FinanceiroPage'));
const BibliotecaPage = lazy(() => import('./biblioteca/BibliotecaPage'));
const ComunicacaoPage = lazy(() => import('./comunicacao/ComunicacaoPage'));
const PerfilPage = lazy(() => import('./perfil/PerfilPage'));
const CalendarioProfessorPage = lazy(() => import('./calendario/CalendarioProfessorPage'));

interface ProfessorPoloTransitionState {
  fromPoloId: string;
  fromPoloName: string;
  fromPoloCity?: string | null;
  fromPoloState?: string | null;
  fromPoloIsMatriz?: boolean;
  toPoloId: string;
  toPoloName: string;
  toPoloCity?: string | null;
  toPoloState?: string | null;
  toPoloIsMatriz?: boolean;
  status: PoloTransitionStatus;
  errorMessage?: string;
}

const POLO_TRANSITION_MINIMUM_MS = 550;
const POLO_TRANSITION_SUCCESS_MS = 450;

const ProfessorPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const executeLogout = usePortalLogout({ loginPath: '/sistema/login' });
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
  const [poloTransition, setPoloTransition] = useState<ProfessorPoloTransitionState | null>(null);
  const poloTransitionRunRef = useRef(0);

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
          queryClient.clear();
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
        queryClient.clear();
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
  }, [navigate, queryClient]);

  // Fetch active polos for seletor
  const professorPoloIds = (profile?.poloIds || []).filter(Boolean).sort();
  const { data: activePolos = [], isLoading: isLoadingActivePolos } = useQuery<ProfessorPolo[]>({
    queryKey: ['professor-active-polos', profile?.id, professorPoloIds],
    enabled: Boolean(profile && !isAuthLoading),
    queryFn: async () => {
      if (professorPoloIds.length === 0) return [];

      const { data, error } = await supabase
        .from('polos')
        .select('id, nome, cnpj, cidade, estado, is_matriz')
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

  const executePoloChange = async (poloId: string) => {
    const nextPolo = activePolos.find((polo) => polo.id === poloId);
    if (!nextPolo || !currentPolo || poloId === currentPoloId) {
      setIsPoloSelectorOpen(false);
      return;
    }
    if (poloTransition?.status === 'loading' || poloTransition?.status === 'success') {
      return;
    }

    const runId = ++poloTransitionRunRef.current;
    const startedAt = Date.now();
    const previousPoloId = currentPoloId || currentPolo.id;
    let hasCommitted = false;

    setIsPoloSelectorOpen(false);
    setPoloTransition({
      fromPoloId: previousPoloId,
      fromPoloName: currentPolo.nome,
      fromPoloCity: currentPolo.cidade,
      fromPoloState: currentPolo.estado,
      fromPoloIsMatriz: currentPolo.is_matriz,
      toPoloId: poloId,
      toPoloName: nextPolo.nome,
      toPoloCity: nextPolo.cidade,
      toPoloState: nextPolo.estado,
      toPoloIsMatriz: nextPolo.is_matriz,
      status: 'loading',
    });

    try {
      if (activeModule === 'inicio') {
        await queryClient.ensureQueryData(professorDashboardQueryOptions(professorId, poloId));
      }
      if (poloTransitionRunRef.current !== runId) return;

      setCurrentPoloId(poloId);
      sessionStorage.setItem('active_polo_id', poloId);
      hasCommitted = true;

      await waitForActivePoloQueries(queryClient, poloId, startedAt);
      const remainingMinimum = POLO_TRANSITION_MINIMUM_MS - (Date.now() - startedAt);
      if (remainingMinimum > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingMinimum));
      }
      if (poloTransitionRunRef.current !== runId) return;

      setPoloTransition((current) => current?.toPoloId === poloId
        ? { ...current, status: 'success' }
        : current);
      await new Promise((resolve) => window.setTimeout(resolve, POLO_TRANSITION_SUCCESS_MS));
      if (poloTransitionRunRef.current === runId) {
        setPoloTransition(null);
      }
    } catch (error) {
      if (poloTransitionRunRef.current !== runId) return;
      console.error('Não foi possível concluir a troca de polo no portal do professor:', error);
      if (hasCommitted) {
        setCurrentPoloId(previousPoloId);
        sessionStorage.setItem('active_polo_id', previousPoloId);
      }
      setPoloTransition((current) => current?.toPoloId === poloId
        ? {
            ...current,
            status: 'error',
            errorMessage: 'Não foi possível carregar os dados do polo selecionado. Verifique sua conexão e tente novamente.',
          }
        : current);
    }
  };

  const handlePoloChange = (poloId: string) => {
    void executePoloChange(poloId);
  };

  const cancelPoloTransition = () => {
    poloTransitionRunRef.current += 1;
    setPoloTransition(null);
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
        return <FinanceiroPage professorId={professorId} poloId={currentPoloId || ''} />;
      case 'calendario':
        return <CalendarioProfessorPage professorId={professorId} poloId={currentPoloId || ''} />;
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
        <Suspense fallback={(
          <div role="status" className="flex min-h-[420px] items-center justify-center text-xs font-black uppercase tracking-widest text-slate-500">
            Preparando módulo...
          </div>
        )}>
          {renderContent()}
        </Suspense>
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

      {poloTransition ? (
        poloTransition.status === 'error' ? (
          <PoloTransitionOverlay
            isOpen
            fromPoloName={poloTransition.fromPoloName}
            fromPoloCity={poloTransition.fromPoloCity}
            fromPoloState={poloTransition.fromPoloState}
            fromPoloIsMatriz={poloTransition.fromPoloIsMatriz}
            toPoloName={poloTransition.toPoloName}
            toPoloCity={poloTransition.toPoloCity}
            toPoloState={poloTransition.toPoloState}
            toPoloIsMatriz={poloTransition.toPoloIsMatriz}
            status="error"
            errorMessage={poloTransition.errorMessage}
            onRetry={() => { void executePoloChange(poloTransition.toPoloId); }}
            onCancel={cancelPoloTransition}
          />
        ) : (
          <PoloTransitionOverlay
            isOpen
            fromPoloName={poloTransition.fromPoloName}
            fromPoloCity={poloTransition.fromPoloCity}
            fromPoloState={poloTransition.fromPoloState}
            fromPoloIsMatriz={poloTransition.fromPoloIsMatriz}
            toPoloName={poloTransition.toPoloName}
            toPoloCity={poloTransition.toPoloCity}
            toPoloState={poloTransition.toPoloState}
            toPoloIsMatriz={poloTransition.toPoloIsMatriz}
            status={poloTransition.status}
          />
        )
      ) : null}
    </>
  );
};

export default ProfessorPage;
