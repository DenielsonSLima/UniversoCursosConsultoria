
// File: modules/gestor/gestor.page.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CreditCard, Handshake, Search, Settings, User } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { clearPortalSession, getGestorAccessScope, getPortalProfile, PortalAuthProfile, savePortalSession } from '../login/portal-session';
import { isPortalScheduleBlocked } from '../login/portal-schedule';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import { usePortalLogout } from '../shared/hooks/usePortalLogout';

import { loginService } from '../login/login.service';
import {
  buildDashboardAccessKey,
  canAccessGestorModule,
  canAccessCommunicationRoute,
  normalizeGestorPermissions,
  canAccessTab,
  getAllowedDashboardWidgets,
} from './access-control';
import { useGestorOperationalRealtime } from './hooks/useGestorOperationalRealtime';
import { caixaDashboardQueryOptions } from './caixa/caixa.service';
import {
  dashboardActivityQueryOptions,
  dashboardChartQueryOptions,
  dashboardKpisQueryOptions,
  dashboardQueryKeys,
} from './dashboard/dashboard.queries';
import { gestorCalendarQueryOptions } from './calendario/calendario.queries';
import GestorPortalShell from './components/GestorPortalShell';
import { NoAccessScreen, ScheduleBlockedScreen } from './components/GestorAccessStates';
import { usePendingCommunicationCount } from './hooks/usePendingCommunicationCount';
import GestorModuleContent, { loadCaixaPage, loadSecretariaPage } from './components/GestorModuleContent';
import { buildGestorNavigation, GESTOR_MODULE_ORDER, POLO_CADASTROS_ALLOWED } from './gestor-navigation';
import PoloTransitionOverlay, {
  PoloTransitionStatus,
} from '../shared/components/PoloTransitionOverlay';
import { waitForActivePoloQueries } from '../shared/utils/poloTransitionQueries';
import { meuPerfilService } from './meu-perfil/meu-perfil.service';
import type { MeuPerfilGestorData } from './meu-perfil/meu-perfil.types';

const MOCK_SEARCH_DATA = [
  { id: 1, type: 'student', title: 'Ana Clara Souza', subtitle: 'Enfermagem - Matutino', module: 'cadastros-alunos' },
  { id: 2, type: 'student', title: 'João Pedro Alves', subtitle: 'Radiologia - Noturno', module: 'cadastros-alunos' },
  { id: 3, type: 'financial', title: 'Pagamento Pendente', subtitle: 'Mensalidade Fev/2026 - Marcos Silva', module: 'financeiro' },
  { id: 4, type: 'financial', title: 'Fluxo de Caixa', subtitle: 'Relatório diário de entradas', module: 'caixa' },
  { id: 5, type: 'module', title: 'Emitir Declaração', subtitle: 'Acesso rápido à Secretaria', module: 'secretaria' },
  { id: 6, type: 'module', title: 'Cadastrar Novo Aluno', subtitle: 'Atalho para Parceiros', module: 'parceiros-novo-aluno' },
  { id: 7, type: 'partner', title: 'Prefeitura de Japoatã', subtitle: 'Convênio Ativo', module: 'parceiros' },
];

interface PoloTransitionState {
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
  previousModule: string;
  status: PoloTransitionStatus;
  errorMessage?: string;
}

interface GestorPoloOption {
  id: string;
  nome: string;
  cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  is_matriz: boolean;
  status: string;
}

const POLO_TRANSITION_MINIMUM_MS = 550;
const POLO_TRANSITION_SUCCESS_MS = 450;

const GestorPage: React.FC = () => {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [activeModule, setActiveModuleState] = useState('inicio');
  const [hasUnsavedAutomationDraft, setHasUnsavedAutomationDraft] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [isPoloSelectorOpen, setIsPoloSelectorOpen] = useState(false);

  const setActiveModule = useCallback((moduleId: string) => {
    if (moduleId === activeModule) return;
    if (hasUnsavedAutomationDraft && !window.confirm('Descartar as alterações não salvas deste rascunho antes de sair?')) {
      return;
    }
    setHasUnsavedAutomationDraft(false);
    setActiveModuleState(moduleId);
  }, [activeModule, hasUnsavedAutomationDraft]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof MOCK_SEARCH_DATA>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [poloTransition, setPoloTransition] = useState<PoloTransitionState | null>(null);
  const poloTransitionRunRef = useRef(0);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const executeLogout = usePortalLogout({ loginPath: '/sistema/login' });
  // Nunca use dados do storage como autorização. O portal permanece coberto pela
  // tela de verificação até perfil, módulos, polos e agenda virem do servidor.
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAccessRefreshing, setIsAccessRefreshing] = useState(false);
  // current_polo_id: estado de sessão UI (polo selecionado) — usa sessionStorage pois não é dado compartilhado entre usuários
  const [currentPoloId, setCurrentPoloId] = useState<string | null>(() =>
    sessionStorage.getItem('current_polo_id') ||
    sessionStorage.getItem('active_polo_id') ||
    '44444444-4444-4444-4444-444444444444'
  );

  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  const gestorPermissions = useMemo(
    () => profile?.gestorPermissions || normalizeGestorPermissions(null, { fallbackFullAccess: false }),
    [profile],
  );
  const dashboardWidgets = useMemo(
    () => getAllowedDashboardWidgets(gestorPermissions),
    [gestorPermissions],
  );
  const dashboardAccessKey = useMemo(
    () => buildDashboardAccessKey(gestorPermissions, profile?.id),
    [gestorPermissions, profile?.id],
  );
  const gestorScope = useMemo(() => getGestorAccessScope(profile), [profile]);
  const allowedPoloIdsKey = useMemo(
    () => gestorScope.isGlobal
      ? 'global'
      : [...(gestorScope.allowedPoloIds || [])].sort().join(','),
    [gestorScope.allowedPoloIds, gestorScope.isGlobal],
  );
  const isScheduleBlocked = Boolean(
    profile && isPortalScheduleBlocked(profile.restricao_horario, currentDateTime),
  );
  const canUsePortal = Boolean(profile) && !isAuthLoading && !isAccessRefreshing && !isScheduleBlocked;
  const canUseCommunication = canUsePortal && canAccessGestorModule(gestorPermissions, 'comunicacao');
  const needsOperationalRealtime = activeModule === 'gestao'
    || activeModule === 'parceiros'
    || activeModule === 'secretaria';

  useEffect(() => {
    let cancelled = false;
    const loadProfileAvatar = async () => {
      const url = await meuPerfilService.createAvatarUrl(profile?.fotoPath);
      if (!cancelled) setProfileAvatarUrl(url);
    };
    void loadProfileAvatar();
    return () => {
      cancelled = true;
    };
  }, [profile?.fotoPath]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = useMemo(() => {
    return currentDateTime.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, [currentDateTime]);

  const formattedDayOfWeek = useMemo(() => {
    return currentDateTime.toLocaleDateString('pt-BR', {
      weekday: 'long'
    }).toLowerCase();
  }, [currentDateTime]);

  const { data: activePolos = [], isLoading: isLoadingPolos } = useQuery<GestorPoloOption[]>({
    queryKey: ['active_polos', profile?.id || 'sem-usuario', allowedPoloIdsKey],
    queryFn: async () => {
      let query = supabase
        .from('polos')
        .select('id, nome, cnpj, cidade, estado, is_matriz, status')
        .eq('status', 'ativo')
        .order('is_matriz', { ascending: false })
        .order('nome', { ascending: true });

      if (!gestorScope.isGlobal) {
        query = query.in('id', gestorScope.allowedPoloIds || []);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: canUsePortal && (gestorScope.isGlobal || Boolean(gestorScope.allowedPoloIds?.length)),
  });

  useEffect(() => {
    if (!canUsePortal) return;

    let channel = supabase.channel(`header_polos_realtime_${profile?.id || 'usuario'}`);
    const invalidatePolos = () => {
      void queryClient.invalidateQueries({ queryKey: ['active_polos'] });
    };

    if (gestorScope.isGlobal) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polos' },
        invalidatePolos,
      )
    } else {
      (gestorScope.allowedPoloIds || []).forEach((poloId) => {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'polos', filter: `id=eq.${poloId}` },
          invalidatePolos,
        );
      });
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    canUsePortal,
    gestorScope.allowedPoloIds,
    gestorScope.isGlobal,
    profile?.id,
    queryClient,
  ]);

  const pendingChatsCount = usePendingCommunicationCount(canUseCommunication);


  useEffect(() => {
    let mounted = true;

    const hydrateProfile = async () => {
      try {
        const portalProfile = await getPortalProfile({ preferredRole: 'Gestor', allowedRoles: ['Gestor'] });
        if (!mounted) return;

        if (!portalProfile || portalProfile.tipo !== 'Gestor') {
          queryClient.clear();
          clearPortalSession();
          await loginService.logout().catch(() => undefined);
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          navigate(`/sistema/login?redirect=${redirect}`, { replace: true });
          return;
        }

        const scope = getGestorAccessScope(portalProfile);
        if (!scope.isGlobal && scope.activePoloId) {
          setCurrentPoloId(scope.activePoloId);
          sessionStorage.setItem('current_polo_id', scope.activePoloId);
          sessionStorage.setItem('active_polo_id', scope.activePoloId);
        }

        queryClient.removeQueries({ queryKey: dashboardQueryKeys.all });
        savePortalSession(portalProfile);
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

  useEffect(() => {
    if (!profile?.id) return;

    let cancelled = false;
    const revalidateAccess = async () => {
      setIsAccessRefreshing(true);
      try {
        const refreshed = await getPortalProfile({ preferredRole: 'Gestor', allowedRoles: ['Gestor'] });
        if (cancelled) return;
        if (!refreshed) {
          await executeLogout();
          return;
        }
        queryClient.removeQueries({ queryKey: dashboardQueryKeys.all });
        savePortalSession(refreshed);
        setProfile(refreshed);
      } catch {
        if (!cancelled) await executeLogout();
      } finally {
        if (!cancelled) setIsAccessRefreshing(false);
      }
    };

    const channel = supabase
      .channel(`gestor_access_${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'usuarios_sistema', filter: `id=eq.${profile.id}` },
        () => { void revalidateAccess(); },
      );

    if (profile.perfil_acesso_id) {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'perfis_acesso', filter: `id=eq.${profile.perfil_acesso_id}` },
        () => { void revalidateAccess(); },
      );
    }

    channel.subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [executeLogout, profile?.id, profile?.perfil_acesso_id, queryClient]);

  const visiblePolos = useMemo(
    () => activePolos,
    [activePolos, gestorScope.allowedPoloIds, gestorScope.isGlobal],
  );
  const currentPolo =
    visiblePolos.find(polo => polo.id === currentPoloId) || visiblePolos[0];
  const effectivePoloId = currentPolo?.id || null;
  const isMatrizSelected = currentPolo?.is_matriz === true;
  const scopedPoloId = gestorScope.isGlobal
    ? effectivePoloId
    : effectivePoloId || gestorScope.activePoloId;
  const preloadModule = useCallback((moduleId: string) => {
    if (moduleId === 'secretaria') {
      void loadSecretariaPage();
    }
    if (moduleId === 'caixa') {
      void loadCaixaPage();
      const dashboardPoloId = scopedPoloId || (gestorScope.isGlobal ? 'todos' : null);
      if (dashboardPoloId) {
        void queryClient.prefetchQuery(caixaDashboardQueryOptions(dashboardPoloId));
      }
    }
  }, [gestorScope.isGlobal, queryClient, scopedPoloId]);

  const prepareCriticalPoloData = useCallback(async (poloId: string) => {
    if (activeModule === 'inicio') {
      const hasKpis = dashboardWidgets.some((widgetId) => [
        'alunos-ativos',
        'receita-mes',
        'inadimplencia',
        'matriculas-mes',
      ].includes(widgetId));
      const dashboardPromises: Array<Promise<unknown>> = [];

      if (hasKpis) {
        dashboardPromises.push(
          queryClient.ensureQueryData(dashboardKpisQueryOptions(poloId, dashboardAccessKey)),
        );
      }
      if (dashboardWidgets.includes('fluxo-caixa')) {
        dashboardPromises.push(
          queryClient.ensureQueryData(dashboardChartQueryOptions(poloId, dashboardAccessKey)),
        );
      }
      if (dashboardWidgets.includes('atividade-recente')) {
        dashboardPromises.push(
          queryClient.ensureQueryData(dashboardActivityQueryOptions(poloId, dashboardAccessKey)),
        );
      }

      await Promise.all(dashboardPromises);
      return;
    }

    if (activeModule === 'caixa') {
      await queryClient.ensureQueryData(caixaDashboardQueryOptions(poloId));
      return;
    }

    if (activeModule === 'calendario') {
      await queryClient.ensureQueryData(gestorCalendarQueryOptions(poloId));
    }
  }, [activeModule, dashboardAccessKey, dashboardWidgets, queryClient]);

  useGestorOperationalRealtime({
    enabled: canUsePortal && needsOperationalRealtime,
    poloId: scopedPoloId,
    includeGlobalPartners: gestorScope.isGlobal,
  });
  const canOpenModule = useCallback((moduleId: string) => {
    if (moduleId === 'meu-perfil') return true;
    const rootModule = moduleId.startsWith('parceiros-novo-')
      ? 'parceiros'
      : moduleId.startsWith('cadastros-')
      ? 'cadastros'
      : moduleId.startsWith('comunicacao-')
        ? 'comunicacao'
        : moduleId;
    if (!canAccessGestorModule(gestorPermissions, rootModule)) return false;
    if (moduleId.startsWith('cadastros-') && !canAccessTab(gestorPermissions, 'cadastros', moduleId)) {
      return false;
    }
    if (moduleId.startsWith('comunicacao-') && !canAccessCommunicationRoute(gestorPermissions, moduleId)) {
      return false;
    }
    if (moduleId === 'comunicacao-automacoes' && (!gestorPermissions.allPolos || !isMatrizSelected)) {
      return false;
    }
    if (
      moduleId === 'comunicacao'
      && !canAccessTab(gestorPermissions, 'comunicacao', 'comunicacao-mensagem')
      && !canAccessTab(gestorPermissions, 'comunicacao', 'comunicacao-whatsapp')
      && !(
        gestorPermissions.allPolos
        && isMatrizSelected
        && canAccessTab(gestorPermissions, 'comunicacao', 'comunicacao-automacoes')
      )
    ) {
      return false;
    }
    if (rootModule === 'configuracoes' && !isMatrizSelected) return false;
    if (!isMatrizSelected && moduleId.startsWith('cadastros-') && !POLO_CADASTROS_ALLOWED.has(moduleId)) {
      return false;
    }
    return true;
  }, [gestorPermissions, isMatrizSelected]);
  const firstAllowedModule = useMemo(
    () => GESTOR_MODULE_ORDER.find(canOpenModule) || null,
    [canOpenModule],
  );

  useEffect(() => {
    if (visiblePolos.length > 0) {
      const isValid = visiblePolos.some(p => p.id === currentPoloId);
      if (!isValid) {
        const matriz = visiblePolos.find(p => p.is_matriz) || visiblePolos[0];
        setCurrentPoloId(matriz.id || null);
        if (matriz.id) {
          sessionStorage.setItem('current_polo_id', matriz.id);
        }
      }
    }
  }, [visiblePolos, currentPoloId]);

  useEffect(() => {
    if (isAuthLoading || !profile) return;
    if (!canOpenModule(activeModule) && firstAllowedModule) {
      setHasUnsavedAutomationDraft(false);
      setActiveModuleState(firstAllowedModule);
    }
  }, [activeModule, canOpenModule, firstAllowedModule, isAuthLoading, profile]);

  useInactivityLogout({
    isEnabled: !!profile && !isAuthLoading,
    onTimeout: executeLogout,
  });

  const isMenuPinned = (menuId: string) =>
    activeModule === menuId || activeModule.startsWith(`${menuId}-`);

  useEffect(() => {
    setExpandedMenus((current) => {
      const next = new Set(
        [...current].filter((menuId) => isMenuPinned(menuId))
      );

      if (next.size === current.size && [...next].every((menuId) => current.has(menuId))) {
        return current;
      }

      return next;
    });
  }, [activeModule]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      return;
    }
    const filtered = MOCK_SEARCH_DATA.filter(item => 
      canOpenModule(item.module) && (
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
    setSearchResults(filtered);
  }, [canOpenModule, searchQuery]);

  const scrollContentToTop = useCallback(() => {
    requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, []);

  // Força o scroll para o topo ao trocar de módulo/página
  useEffect(() => {
    scrollContentToTop();
  }, [activeModule, scrollContentToTop]);

  if (isAuthLoading || !profile) {
    return <AccessCheckingScreen portal="Gestor" />;
  }

  if (isScheduleBlocked) {
    return <ScheduleBlockedScreen profile={profile} onLogout={executeLogout} />;
  }

  if (isLoadingPolos) {
    return <AccessCheckingScreen portal="Gestor" />;
  }

  if (visiblePolos.length === 0) {
    return <NoAccessScreen kind="units" onLogout={executeLogout} />;
  }

  if (!firstAllowedModule) {
    return <NoAccessScreen kind="modules" onLogout={executeLogout} />;
  }

  const executePoloChange = async (poloId: string) => {
    if (!gestorScope.isGlobal && !gestorScope.allowedPoloIds?.includes(poloId)) {
      return;
    }

    const nextPolo = visiblePolos.find(polo => polo.id === poloId);
    if (!nextPolo || !currentPolo || poloId === effectivePoloId) {
      setIsPoloSelectorOpen(false);
      return;
    }
    if (poloTransition?.status === 'loading' || poloTransition?.status === 'success') {
      return;
    }
    if (hasUnsavedAutomationDraft && !window.confirm('Descartar as alterações não salvas deste rascunho antes de trocar de polo?')) {
      setIsPoloSelectorOpen(false);
      return;
    }

    const runId = ++poloTransitionRunRef.current;
    const startedAt = Date.now();
    const previousPoloId = effectivePoloId || currentPolo.id;
    const previousPoloName = currentPolo.nome || 'Polo atual';
    const nextPoloName = nextPolo.nome || 'Novo polo';
    const previousModule = activeModule;
    let hasCommitted = false;

    setIsPoloSelectorOpen(false);
    setPoloTransition({
      fromPoloId: previousPoloId,
      fromPoloName: previousPoloName,
      fromPoloCity: currentPolo.cidade,
      fromPoloState: currentPolo.estado,
      fromPoloIsMatriz: currentPolo.is_matriz,
      toPoloId: poloId,
      toPoloName: nextPoloName,
      toPoloCity: nextPolo.cidade,
      toPoloState: nextPolo.estado,
      toPoloIsMatriz: nextPolo.is_matriz,
      previousModule,
      status: 'loading',
    });

    try {
      await prepareCriticalPoloData(poloId);
      if (poloTransitionRunRef.current !== runId) return;

      setCurrentPoloId(poloId);
      sessionStorage.setItem('current_polo_id', poloId);
      hasCommitted = true;

      if (!nextPolo.is_matriz && activeModule.startsWith('cadastros-') && !POLO_CADASTROS_ALLOWED.has(activeModule)) {
        setActiveModule('cadastros');
      }
      if (!nextPolo.is_matriz && activeModule === 'configuracoes') {
        setActiveModule('inicio');
      }

      await waitForActivePoloQueries(queryClient, poloId, startedAt);
      const remainingMinimum = POLO_TRANSITION_MINIMUM_MS - (Date.now() - startedAt);
      if (remainingMinimum > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingMinimum));
      }
      if (poloTransitionRunRef.current !== runId) return;

      setHasUnsavedAutomationDraft(false);
      setPoloTransition((current) => current?.toPoloId === poloId
        ? { ...current, status: 'success' }
        : current);
      await new Promise((resolve) => window.setTimeout(resolve, POLO_TRANSITION_SUCCESS_MS));
      if (poloTransitionRunRef.current === runId) {
        setPoloTransition(null);
      }
    } catch (error) {
      if (poloTransitionRunRef.current !== runId) return;
      console.error('Não foi possível concluir a troca de polo no portal do gestor:', error);

      if (hasCommitted) {
        setCurrentPoloId(previousPoloId);
        sessionStorage.setItem('current_polo_id', previousPoloId);
        setActiveModule(previousModule);
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

  const handleLogout = async () => {
    if (hasUnsavedAutomationDraft && !window.confirm('Descartar as alterações não salvas deste rascunho antes de sair do portal?')) {
      return;
    }
    setIsLogoutConfirmOpen(true);
  };

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((current) => {
      if (current.has(menuId)) return new Set();
      return new Set([menuId]);
    });
  };

  const isDesktopMenuExpanded = (menuId: string) =>
    expandedMenus.size > 0 ? expandedMenus.has(menuId) : isMenuPinned(menuId);

  const handleSearchResultClick = (module: string) => {
    if (!canOpenModule(module)) return;
    setActiveModule(module);
    setSearchQuery('');
    setIsSearchFocused(false);
  };

  const { visibleCadastroSubItems, visibleMenuItems } = buildGestorNavigation({
    permissions: gestorPermissions,
    isMatrizSelected,
    pendingChatsCount,
    canOpenModule,
  });

  const renderContent = () => (
    <GestorModuleContent
      activeModule={activeModule}
      canOpenModule={canOpenModule}
      isMatrizSelected={isMatrizSelected}
      allowedCadastroTabs={visibleCadastroSubItems.map(item => item.id)}
      setActiveModule={setActiveModule}
      currentPoloId={effectivePoloId}
      scopedPoloId={scopedPoloId}
      isGlobal={gestorScope.isGlobal}
      currentPoloName={currentPolo?.nome}
      onRequestScrollTop={scrollContentToTop}
      permissions={gestorPermissions}
      profile={profile}
      profileAvatarUrl={profileAvatarUrl}
      onAutomationDraftDirtyChange={setHasUnsavedAutomationDraft}
      onProfileUpdated={(updated: MeuPerfilGestorData) => {
        setProfile((current) => {
          if (!current) return current;
          const nextProfile: PortalAuthProfile = {
            ...current,
            nome: updated.nome,
            email: updated.email,
            telefone: updated.telefone,
            fotoPath: updated.fotoPath,
          };
          savePortalSession(nextProfile);
          return nextProfile;
        });
        void meuPerfilService
          .createAvatarUrl(updated.fotoPath)
          .then(setProfileAvatarUrl);
      }}
    />
  );

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'student': return <User size={16} className="text-blue-500" />;
      case 'financial': return <CreditCard size={16} className="text-emerald-500" />;
      case 'module': return <Settings size={16} className="text-slate-500" />;
      case 'partner': return <Handshake size={16} className="text-purple-500" />;
      default: return <Search size={16} />;
    }
  };

  return (
    <>
      <GestorPortalShell
        profile={profile}
        profileAvatarUrl={profileAvatarUrl}
        visibleMenuItems={visibleMenuItems}
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        expandedMenus={expandedMenus}
        toggleMenu={toggleMenu}
        isDesktopMenuExpanded={isDesktopMenuExpanded}
        preloadModule={preloadModule}
        handleLogout={handleLogout}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        isSearchFocused={isSearchFocused}
        setIsSearchFocused={setIsSearchFocused}
        handleSearchResultClick={handleSearchResultClick}
        getResultIcon={getResultIcon}
        isLoadingPolos={isLoadingPolos}
        currentPolo={currentPolo}
        visiblePolos={visiblePolos}
        currentPoloId={effectivePoloId}
        isPoloSelectorOpen={isPoloSelectorOpen}
        setIsPoloSelectorOpen={setIsPoloSelectorOpen}
        handlePoloChange={handlePoloChange}
        formattedDate={formattedDate}
        formattedDayOfWeek={formattedDayOfWeek}
        contentScrollRef={contentScrollRef}
        renderContent={renderContent}
        isLogoutConfirmOpen={isLogoutConfirmOpen}
        setIsLogoutConfirmOpen={setIsLogoutConfirmOpen}
        executeLogout={executeLogout}
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

      {isAccessRefreshing ? (
        <div className="fixed inset-0 z-[75]">
          <AccessCheckingScreen portal="Gestor" />
        </div>
      ) : null}
    </>
  );
};

export default GestorPage;
