import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { usePortalContextAccess } from '../login/usePortalContextAccess';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import { usePortalLogout } from '../shared/hooks/usePortalLogout';
import ConfirmModal from '../shared/components/ConfirmModal';
import PoloTransitionOverlay, {
  PoloTransitionStatus,
} from '../shared/components/PoloTransitionOverlay';
import { waitForActivePoloQueries } from '../shared/utils/poloTransitionQueries';
import { professorDashboardQueryOptions } from './hooks/useProfessorDashboard';
import {
  getProfessorModuleFromPath,
  getProfessorPathFromModule,
} from '../login/coordinator-portal-redirect';
import {
  professorActivePolosFreshnessOptions,
  resolveProfessorAccessGate,
} from './professor-access-gate';

// Sub-módulos do Professor
import ProfessorShell, { ProfessorPolo } from './components/ProfessorShell';

const InicioPage = lazy(() => import('./inicio/InicioPage'));
const TurmasPage = lazy(() => import('./turmas/TurmasPage'));
const FinanceiroPage = lazy(() => import('./financeiro/FinanceiroPage'));
const BibliotecaPage = lazy(() => import('./biblioteca/BibliotecaPage'));
const ComunicacaoPage = lazy(() => import('./comunicacao/ComunicacaoPage'));
const PerfilPage = lazy(() => import('./perfil/PerfilPage'));
const CalendarioProfessorPage = lazy(() => import('./calendario/CalendarioProfessorPage'));
const PlanoCursoPage = lazy(() => import('./plano-curso/PlanoCursoPage'));
const ProfessorAssinaturasPage = lazy(() => import('./assinaturas/ProfessorAssinaturasPage'));

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

const ProfessorConnectionError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
    <section className="w-full max-w-xl rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-xl">
      <RefreshCw className="mx-auto text-rose-600" size={28} />
      <h1 className="mt-4 text-xl font-black text-[#001a33]">Não foi possível conferir o acesso</h1>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">Nenhum dado do portal foi liberado. Verifique a conexão e tente novamente; sua sessão não foi encerrada.</p>
      <button type="button" onClick={onRetry} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#001a33] px-5 text-xs font-black uppercase tracking-wide text-white hover:bg-blue-900"><RefreshCw size={16} /> Tentar novamente</button>
    </section>
  </main>
);

const ProfessorPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    profile,
    isLoading: isAuthLoading,
    connectionError,
    retry: retryAccess,
  } = usePortalContextAccess('Professor');
  const executeLogout = usePortalLogout({ loginPath: '/sistema/login' });
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [activeModule, setActiveModule] = useState(
    () => getProfessorModuleFromPath(location.pathname) || 'inicio',
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentPoloId, setCurrentPoloId] = useState<string | null>(null);
  const [isPoloSelectorOpen, setIsPoloSelectorOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [poloTransition, setPoloTransition] = useState<ProfessorPoloTransitionState | null>(null);
  const poloTransitionRunRef = useRef(0);

  const scrollContentToTop = useCallback(() => {
    requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, []);

  const handleModuleChange = useCallback((moduleId: string) => {
    setActiveModule(moduleId);
    const targetPath = getProfessorPathFromModule(moduleId);
    if (location.pathname !== targetPath) navigate(targetPath);
  }, [location.pathname, navigate]);

  useEffect(() => {
    const routeModule = getProfessorModuleFromPath(location.pathname);
    if (routeModule) setActiveModule(routeModule);
  }, [location.pathname]);

  // Força o scroll para o topo ao trocar de módulo/página
  useEffect(() => {
    scrollContentToTop();
  }, [activeModule, scrollContentToTop]);

  const professorId = profile?.id || '';
  const professorNome = profile?.nome || '';
  const professorEmail = profile?.email || '';

  // Fetch active polos for seletor
  const professorPoloIds = (profile?.poloIds || []).filter(Boolean).sort();

  useEffect(() => {
    if (!profile) return;
    const allowedPoloIds = (profile.poloIds || []).filter(Boolean).sort();
    const preferredPoloId = profile.activePoloId
      && allowedPoloIds.includes(profile.activePoloId)
      ? profile.activePoloId
      : allowedPoloIds[0] || null;
    setCurrentPoloId(preferredPoloId);
  }, [profile]);

  const {
    data: activePolos = [],
    isError: activePolosError,
    isLoading: isLoadingActivePolos,
    isSuccess: activePolosLoaded,
    isFetchedAfterMount: activePolosFetchedAfterMount,
    refetch: refetchActivePolos,
  } = useQuery<ProfessorPolo[]>({
    queryKey: ['professor-active-polos', profile?.id, professorPoloIds],
    enabled: Boolean(profile && !isAuthLoading),
    queryFn: async () => {
      if (professorPoloIds.length === 0) return [];

      const { data, error } = await supabase
        .from('polos')
        .select(`
          id,
          nome,
          cnpj,
          cidade,
          estado,
          is_matriz,
          logo_url,
          endereco,
          numero,
          complemento,
          bairro,
          cep,
          telefone,
          watermark_url,
          watermark_opacity,
          watermark_scale,
          watermark_rotate
        `)
        .in('id', professorPoloIds)
        .eq('status', 'ativo')
        .order('nome', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    ...professorActivePolosFreshnessOptions,
  });

  const activePolosValidated = activePolosLoaded && activePolosFetchedAfterMount;

  // Redireciona apenas depois da autenticação se o professor não tiver polo ativo.
  useEffect(() => {
    if (isAuthLoading || !profile) return;
    if (!activePolosValidated) return;
    if (currentPoloId && activePolos.some((polo) => polo.id === currentPoloId)) return;

    const fallbackPoloId = activePolos[0]?.id || null;
    if (fallbackPoloId) {
      setCurrentPoloId(fallbackPoloId);
      sessionStorage.setItem('active_polo_id', fallbackPoloId);
      return;
    }

    navigate('/sistema/login');
  }, [activePolos, activePolosValidated, currentPoloId, isAuthLoading, navigate, profile]);

  const currentPolo = activePolos.find((polo) => polo.id === currentPoloId) || null;
  const activePolosGate = resolveProfessorAccessGate({
    hasCurrentPolo: Boolean(currentPolo),
    isError: activePolosError,
    isFetchedAfterMount: activePolosFetchedAfterMount,
    isSuccess: activePolosLoaded,
  });

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

  if (connectionError) {
    return <ProfessorConnectionError onRetry={retryAccess} />;
  }

  if (activePolosGate === 'connection-error') {
    return <ProfessorConnectionError onRetry={() => { void refetchActivePolos(); }} />;
  }

  if (isAuthLoading || !profile) {
    return <AccessCheckingScreen portal="Professor" />;
  }

  if (isLoadingActivePolos || activePolosGate !== 'authorized') {
    return <AccessCheckingScreen portal="Professor" />;
  }

  const handleLogout = async () => {
    setIsLogoutConfirmOpen(true);
  };

  const renderContent = () => {
    switch (activeModule) {
      case 'inicio':
        return <InicioPage professorId={professorId} professorNome={professorNome} poloId={currentPoloId} onNavigate={handleModuleChange} />;
      case 'turmas':
        return (
          <TurmasPage
            key={currentPoloId || 'sem-polo'}
            professorId={professorId}
            poloId={currentPoloId || ''}
          />
        );
      case 'plano-curso':
        return (
          <PlanoCursoPage
            key={`${professorId}-${currentPoloId || 'sem-polo'}`}
            professorId={professorId}
            poloId={currentPoloId || ''}
            polo={currentPolo}
          />
        );
      case 'assinatura-eletronica':
        return (
          <ProfessorAssinaturasPage
            capabilities={profile.capabilities}
            contextId={profile.contextId || ''}
            poloId={currentPoloId}
            scopes={profile.scopes}
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
        return <InicioPage professorId={professorId} professorNome={professorNome} onNavigate={handleModuleChange} />;
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
        onModuleChange={handleModuleChange}
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
