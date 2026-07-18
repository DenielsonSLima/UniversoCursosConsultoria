
// File: modules/gestor/gestor.page.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CreditCard, Handshake, Search, Settings, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { clearPortalSession, getGestorAccessScope, getPortalProfile, PortalAuthProfile } from '../login/portal-session';
import { isPortalScheduleBlocked } from '../login/portal-schedule';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import { usePortalLogout } from '../shared/hooks/usePortalLogout';

import { loginService } from '../login/login.service';
import { canAccessGestorModule, normalizeGestorPermissions, canAccessTab } from './access-control';
import { useGestorOperationalRealtime } from './hooks/useGestorOperationalRealtime';
import { caixaDashboardQueryOptions } from './caixa/caixa.service';
import GestorPortalShell from './components/GestorPortalShell';
import { NoAccessScreen, ScheduleBlockedScreen } from './components/GestorAccessStates';
import { usePendingCommunicationCount } from './hooks/usePendingCommunicationCount';
import GestorModuleContent, { loadCaixaPage, loadSecretariaPage } from './components/GestorModuleContent';
import { buildGestorNavigation, GESTOR_MODULE_ORDER, POLO_CADASTROS_ALLOWED } from './gestor-navigation';

const MOCK_SEARCH_DATA = [
  { id: 1, type: 'student', title: 'Ana Clara Souza', subtitle: 'Enfermagem - Matutino', module: 'cadastros-alunos' },
  { id: 2, type: 'student', title: 'João Pedro Alves', subtitle: 'Radiologia - Noturno', module: 'cadastros-alunos' },
  { id: 3, type: 'financial', title: 'Pagamento Pendente', subtitle: 'Mensalidade Fev/2026 - Marcos Silva', module: 'financeiro' },
  { id: 4, type: 'financial', title: 'Fluxo de Caixa', subtitle: 'Relatório diário de entradas', module: 'caixa' },
  { id: 5, type: 'module', title: 'Emitir Declaração', subtitle: 'Acesso rápido à Secretaria', module: 'secretaria' },
  { id: 6, type: 'module', title: 'Cadastrar Novo Aluno', subtitle: 'Atalho para Cadastros', module: 'cadastros-alunos' },
  { id: 7, type: 'partner', title: 'Prefeitura de Japoatã', subtitle: 'Convênio Ativo', module: 'parceiros' },
];

const GestorPage: React.FC = () => {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [activeModule, setActiveModule] = useState('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [hoveredMenus, setHoveredMenus] = useState<Set<string>>(new Set());
  const [isPoloSelectorOpen, setIsPoloSelectorOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof MOCK_SEARCH_DATA>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const executeLogout = usePortalLogout({ loginPath: '/sistema/login' });
  // Nunca use dados do storage como autorização. O portal permanece coberto pela
  // tela de verificação até perfil, módulos, polos e agenda virem do servidor.
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
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
  const isScheduleBlocked = Boolean(
    profile && isPortalScheduleBlocked(profile.restricao_horario, currentDateTime),
  );
  const canUsePortal = Boolean(profile) && !isAuthLoading && !isScheduleBlocked;
  const canUseCommunication = canUsePortal && canAccessGestorModule(gestorPermissions, 'comunicacao');

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

  const { data: activePolos = [], isLoading: isLoadingPolos } = useQuery<any[]>({
    queryKey: ['active_polos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polos')
        .select('*')
        .eq('status', 'ativo')
        .order('is_matriz', { ascending: false })
        .order('nome', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: canUsePortal,
  });

  useEffect(() => {
    if (!canUsePortal) return;
    const channel = supabase
      .channel('header_polos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polos' },
        () => {
          console.log('Header realtime: detectada alteração de polos, recarregando...');
          queryClient.invalidateQueries({ queryKey: ['active_polos'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canUsePortal, queryClient]);

  const pendingChatsCount = usePendingCommunicationCount(canUseCommunication);


  useEffect(() => {
    let mounted = true;

    const hydrateProfile = async () => {
      try {
        const portalProfile = await getPortalProfile({ preferredRole: 'Gestor', allowedRoles: ['Gestor'] });
        if (!mounted) return;

        if (!portalProfile || portalProfile.tipo !== 'Gestor') {
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

  useEffect(() => {
    if (!profile?.id) return;

    let cancelled = false;
    const revalidateAccess = async () => {
      setIsAuthLoading(true);
      try {
        const refreshed = await getPortalProfile({ preferredRole: 'Gestor', allowedRoles: ['Gestor'] });
        if (cancelled) return;
        if (!refreshed) {
          await executeLogout();
          return;
        }
        setProfile(refreshed);
      } catch {
        if (!cancelled) await executeLogout();
      } finally {
        if (!cancelled) setIsAuthLoading(false);
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
  }, [executeLogout, profile?.id, profile?.perfil_acesso_id]);

  const gestorScope = useMemo(() => getGestorAccessScope(profile), [profile]);
  const visiblePolos = useMemo(
    () => gestorScope.isGlobal
      ? activePolos
      : activePolos.filter(polo => gestorScope.allowedPoloIds?.includes(polo.id)),
    [activePolos, gestorScope.allowedPoloIds, gestorScope.isGlobal],
  );
  const currentPolo =
    visiblePolos.find(polo => polo.id === currentPoloId) || visiblePolos[0];
  const isMatrizSelected = currentPolo?.is_matriz === true;
  const scopedPoloId = gestorScope.isGlobal
    ? currentPoloId
    : currentPoloId || gestorScope.activePoloId;
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
  useGestorOperationalRealtime({
    enabled: canUsePortal,
    poloId: scopedPoloId,
    includeGlobalPartners: gestorScope.isGlobal,
  });
  const canOpenModule = useCallback((moduleId: string) => {
    const rootModule = moduleId.startsWith('cadastros-')
      ? 'cadastros'
      : moduleId.startsWith('comunicacao-')
        ? 'comunicacao'
        : moduleId;
    if (!canAccessGestorModule(gestorPermissions, rootModule)) return false;
    if (moduleId.startsWith('cadastros-') && !canAccessTab(gestorPermissions, 'cadastros', moduleId)) {
      return false;
    }
    if (moduleId.startsWith('comunicacao-') && !canAccessTab(gestorPermissions, 'comunicacao', moduleId)) {
      return false;
    }
    if (
      moduleId === 'comunicacao'
      && !canAccessTab(gestorPermissions, 'comunicacao', 'comunicacao-mensagem')
      && !canAccessTab(gestorPermissions, 'comunicacao', 'comunicacao-whatsapp')
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
      setActiveModule(firstAllowedModule);
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

  const handlePoloChange = (poloId: string) => {
    if (!gestorScope.isGlobal && !gestorScope.allowedPoloIds?.includes(poloId)) {
      return;
    }

    const nextPolo = visiblePolos.find(polo => polo.id === poloId);
    setCurrentPoloId(poloId);
    sessionStorage.setItem('current_polo_id', poloId);
    setIsPoloSelectorOpen(false);

    if (!nextPolo?.is_matriz && activeModule.startsWith('cadastros-') && !POLO_CADASTROS_ALLOWED.has(activeModule)) {
      setActiveModule('cadastros');
    }
    if (!nextPolo?.is_matriz && activeModule === 'configuracoes') {
      setActiveModule('inicio');
    }
  };

  const handleLogout = async () => {
    setIsLogoutConfirmOpen(true);
  };

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((current) => {
      const next = new Set(current);
      if (next.has(menuId)) next.delete(menuId);
      else next.add(menuId);
      return next;
    });
  };

  const setMenuHovered = (menuId: string, hovered: boolean) => {
    setHoveredMenus((current) => {
      const next = new Set(current);
      if (hovered) next.add(menuId);
      else next.delete(menuId);
      return next;
    });
  };

  const isDesktopMenuExpanded = (menuId: string) =>
    isMenuPinned(menuId) || expandedMenus.has(menuId) || hoveredMenus.has(menuId);

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
      currentPoloId={currentPoloId}
      scopedPoloId={scopedPoloId}
      isGlobal={gestorScope.isGlobal}
      currentPoloName={currentPolo?.nome}
      onRequestScrollTop={scrollContentToTop}
      permissions={gestorPermissions}
      profile={profile}
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
    <GestorPortalShell
      profile={profile}
      visibleMenuItems={visibleMenuItems}
      activeModule={activeModule}
      setActiveModule={setActiveModule}
      isMobileMenuOpen={isMobileMenuOpen}
      setIsMobileMenuOpen={setIsMobileMenuOpen}
      expandedMenus={expandedMenus}
      toggleMenu={toggleMenu}
      setMenuHovered={setMenuHovered}
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
      currentPoloId={currentPoloId}
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
  );
};

export default GestorPage;
