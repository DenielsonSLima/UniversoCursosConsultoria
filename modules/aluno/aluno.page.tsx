import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  LayoutDashboard, 
  GraduationCap, 
  BookOpen, 
  CreditCard, 
  Library, 
  MessageSquare, 
  User, 
  LogOut, 
  Menu, 
  X,
  FileText,
  CalendarDays,
} from 'lucide-react';
import { loginService } from '../login/login.service';
import { clearPortalSession, getPortalProfile, getPortalSessionFromStorage, PortalAuthProfile } from '../login/portal-session';
import { supabase } from '../../lib/supabase';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import ConfirmModal from '../shared/components/ConfirmModal';
import type { PerfilTabId } from './perfil/perfil.types';
// Cada área é carregada apenas quando o aluno a acessa, reduzindo o peso inicial no celular.
const InicioPage = lazy(() => import('./inicio/InicioPage'));
const TurmasPage = lazy(() => import('./turmas/TurmasPage'));
const CursosPage = lazy(() => import('./cursos/CursosPage'));
const FinanceiroPage = lazy(() => import('./financeiro/FinanceiroPage'));
const BibliotecaPage = lazy(() => import('./biblioteca/BibliotecaPage'));
const ComunicacaoPage = lazy(() => import('./comunicacao/ComunicacaoPage'));
const PerfilPage = lazy(() => import('./perfil/PerfilPage'));
const SecretariaPage = lazy(() => import('./secretaria/SecretariaPage'));
const CalendarioAlunoPage = lazy(() => import('./calendario/CalendarioAlunoPage'));

const AlunoModuleLoading = () => (
  <div className="flex min-h-[240px] items-center justify-center" role="status" aria-label="Carregando área do aluno">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
  </div>
);

const AlunoPage: React.FC = () => {
  const navigate = useNavigate();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const storedProfile = getPortalSessionFromStorage();
  const initialAlunoProfile = storedProfile?.tipo === 'Aluno' ? storedProfile : null;
  const [activeModule, setActiveModule] = useState('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadChatsCount, setUnreadChatsCount] = useState(0);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(initialAlunoProfile);
  const [isAuthLoading, setIsAuthLoading] = useState(!initialAlunoProfile);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [profileNotice, setProfileNotice] = useState<'technical-enrollment' | null>(null);
  const [initialProfileTab, setInitialProfileTab] = useState<PerfilTabId>('perfil');
  const [initialCourseId, setInitialCourseId] = useState<string | null>(null);
  const [initialTurmaId, setInitialTurmaId] = useState<string | null>(null);

  const scrollContentToTop = useCallback(() => {
    requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, []);

  // Força o scroll para o topo ao trocar de módulo/página
  useEffect(() => {
    scrollContentToTop();
  }, [activeModule, scrollContentToTop]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedModule = params.get('module');
    const requestedCourseId = params.get('courseId');
    const requestedProfileTab = params.get('tab');
    if (requestedModule && ['inicio', 'turmas', 'cursos', 'financeiro', 'biblioteca', 'comunicacao', 'secretaria', 'perfil'].includes(requestedModule)) {
      setActiveModule(requestedModule);
    }
    if (requestedCourseId) {
      setInitialCourseId(requestedCourseId);
      setActiveModule('cursos');
    }
    if (requestedProfileTab && ['perfil', 'documentos', 'vacinas', 'google', 'senha'].includes(requestedProfileTab)) {
      setInitialProfileTab(requestedProfileTab as PerfilTabId);
    }
    if (params.get('technicalEnrollment') === '1') {
      setProfileNotice('technical-enrollment');
      setInitialProfileTab('documentos');
      setActiveModule('perfil');
      navigate('/aluno', { replace: true });
      return;
    }
    if (params.get('asaas') === 'success') {
      setActiveModule('turmas');
      navigate('/aluno', { replace: true });
    }
  }, [navigate]);

  const alunoId = profile?.id || '';
  const alunoNome = profile?.nome || '';
  const alunoEmail = profile?.email || '';
  const alunoInitials = (alunoNome.trim().slice(0, 2) || 'AL').toUpperCase();

  const { data: canViewCalendar = false } = useQuery({
    queryKey: ['aluno-calendario-elegibilidade', alunoId],
    enabled: !!alunoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select(`
          id,
          turmas!inner(
            id,
            cursos!inner(id, modalidade)
          )
        `)
        .eq('aluno_id', alunoId)
        .in('status', ['ATIVO', 'CONCLUIDO'])
        .in('turmas.cursos.modalidade', ['TECNICO', 'LIVRE', 'ESPECIALIZACAO'])
        .limit(1);

      if (error) throw error;
      return (data?.length || 0) > 0;
    }
  });

  useEffect(() => {
    let mounted = true;

    const hydrateProfile = async () => {
      try {
        const portalProfile = await getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
        if (!mounted) return;

        if (!portalProfile || portalProfile.tipo !== 'Aluno') {
          clearPortalSession();
          await loginService.logout().catch(() => undefined);
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          navigate(`/login?redirect=${redirect}`, { replace: true });
          return;
        }

        setProfile(portalProfile);
      } catch {
        clearPortalSession();
        await loginService.logout().catch(() => undefined);
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        navigate(`/login?redirect=${redirect}`, { replace: true });
      } finally {
        if (mounted) setIsAuthLoading(false);
      }
    };

    hydrateProfile();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  // ─── Carregar contagem inicial de chamados não lidos (mensagens de gestor/sistema com lida = false) ───
  useEffect(() => {
    if (!profile?.id) return;

    const fetchUnread = async () => {
      try {
        const { data: studentChats } = await supabase
          .from('comunicacao_chats')
          .select('id')
          .eq('remetente_id', alunoId)
          .eq('deleted_by_aluno', false);
        
        const chatIds = studentChats?.map(c => c.id) || [];
        if (chatIds.length === 0) {
          setUnreadChatsCount(0);
          return;
        }

        const { data: unreadMessages } = await supabase
          .from('comunicacao_mensagens')
          .select('chat_id')
          .in('chat_id', chatIds)
          .eq('lida', false)
          .in('remetente_tipo', ['gestor', 'sistema']);
        
        const uniqueUnreadChats = new Set(unreadMessages?.map(m => m.chat_id) || []);
        setUnreadChatsCount(uniqueUnreadChats.size);
      } catch (err) {
        console.error('Erro ao buscar contagem de chamados não lidos:', err);
      }
    };
    fetchUnread();
  }, [alunoId, profile?.id]);

  // ─── Realtime: manter badge de chamados não lidos do aluno atualizado em tempo real ───
  useEffect(() => {
    if (!profile?.id) return;

    const fetchUnread = async () => {
      try {
        const { data: studentChats } = await supabase
          .from('comunicacao_chats')
          .select('id')
          .eq('remetente_id', alunoId)
          .eq('deleted_by_aluno', false);
        
        const chatIds = studentChats?.map(c => c.id) || [];
        if (chatIds.length === 0) {
          setUnreadChatsCount(0);
          return;
        }

        const { data: unreadMessages } = await supabase
          .from('comunicacao_mensagens')
          .select('chat_id')
          .in('chat_id', chatIds)
          .eq('lida', false)
          .in('remetente_tipo', ['gestor', 'sistema']);
        
        const uniqueUnreadChats = new Set(unreadMessages?.map(m => m.chat_id) || []);
        setUnreadChatsCount(uniqueUnreadChats.size);
      } catch (err) {
        console.error('Erro ao buscar contagem de chamados não lidos em tempo real:', err);
      }
    };

    const badgeChannel = supabase
      .channel('aluno_sidebar_unread_badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comunicacao_mensagens' },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(badgeChannel);
    };
  }, [alunoId, profile?.id]);

  const executeLogout = async () => {
    await loginService.logout().catch(() => undefined);
    clearPortalSession();
    navigate('/login');
  };

  useInactivityLogout({
    isEnabled: !!profile && !isAuthLoading,
    onTimeout: executeLogout,
  });

  useEffect(() => {
    if (activeModule === 'calendario' && !canViewCalendar) {
      setActiveModule('inicio');
    }
  }, [activeModule, canViewCalendar]);

  if (isAuthLoading || !profile) {
    return <AccessCheckingScreen portal="Aluno" />;
  }

  const handleLogout = async () => {
    setIsLogoutConfirmOpen(true);
  };

  const requireTechnicalProfileCompletion = () => {
    setProfileNotice('technical-enrollment');
    setActiveModule('perfil');
  };

  const menuItems = [
    { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={20} /> },
    { id: 'turmas', label: 'Meus Cursos', icon: <GraduationCap size={20} /> },
    { id: 'cursos', label: 'Cursos', icon: <BookOpen size={20} /> },
    ...(canViewCalendar ? [{ id: 'calendario', label: 'Agenda', icon: <CalendarDays size={20} /> }] : []),
    { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={20} /> },
    { id: 'biblioteca', label: 'Biblioteca', icon: <Library size={20} /> },
    { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={20} />, badge: unreadChatsCount },
    { id: 'secretaria', label: 'Secretaria', icon: <FileText size={20} /> },
    { id: 'perfil', label: 'Meu Perfil', icon: <User size={20} /> },
  ];

  const renderContent = () => {
      switch (activeModule) {
      case 'inicio':
        return (
          <InicioPage
            alunoId={alunoId}
            onNavigate={setActiveModule}
            onOpenCourse={(courseId, turmaId, targetModule) => {
              setInitialCourseId(courseId);
              setInitialTurmaId(turmaId || null);
              setActiveModule(targetModule || 'cursos');
            }}
          />
        );
      case 'turmas':
        return (
          <TurmasPage
            alunoId={alunoId}
            initialCourseId={initialCourseId}
            initialTurmaId={initialTurmaId}
            onInitialSelectionConsumed={() => {
              setInitialCourseId(null);
              setInitialTurmaId(null);
            }}
          />
        );
      case 'cursos':
        return (
          <CursosPage
            alunoId={alunoId}
            initialCourseId={initialCourseId}
            onRequireTechnicalProfile={requireTechnicalProfileCompletion}
          />
        );
      case 'calendario':
        return <CalendarioAlunoPage alunoId={alunoId} />;
      case 'financeiro':
        return <FinanceiroPage alunoId={alunoId} />;
      case 'biblioteca':
        return <BibliotecaPage alunoId={alunoId} />;
      case 'comunicacao':
        return <ComunicacaoPage alunoId={alunoId} alunoNome={alunoNome} />;
      case 'secretaria':
        return <SecretariaPage alunoId={alunoId} />;
      case 'perfil':
        return (
          <PerfilPage
            alunoId={alunoId}
            initialTab={initialProfileTab}
            technicalEnrollmentNotice={profileNotice === 'technical-enrollment'}
            onTechnicalEnrollmentNoticeResolved={() => setProfileNotice(null)}
          />
        );
      default:
        return <InicioPage alunoId={alunoId} onNavigate={setActiveModule} />;
    }
  };

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-slate-100 font-sans antialiased">
      
      {/* Sidebar - Desktop Layout */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#001a33] text-white shadow-xl z-20">
        <div className="p-6 border-b border-white/10">
          <div className="bg-white p-3 rounded-2xl shadow-md flex items-center justify-center">
            <img 
              src="/LogoUniverso.png" 
              alt="Universo Cursos e Consultoria" 
              className="h-11 w-full object-contain" 
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-200 group ${
                activeModule === item.id 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 font-bold' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`relative ${activeModule === item.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`}>
                  {item.icon}
                  {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5 shadow-md animate-pulse">
                      {(item as any).badge > 99 ? '99+' : (item as any).badge}
                    </span>
                  )}
                </div>
                <span className="text-sm tracking-wide">{item.label}</span>
              </div>
              {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                <span className="text-[9px] font-black bg-red-500 text-white rounded-full min-w-[18px] h-4 flex items-center justify-center px-1">
                  {(item as any).badge > 99 ? '99+' : (item as any).badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white shadow-md">
              {alunoInitials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-black">{alunoNome}</p>
              <p className="truncate text-[10px] font-medium text-slate-400" title={alunoEmail}>{alunoEmail}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 py-3 rounded-xl transition-all text-sm font-bold uppercase tracking-wider"
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#001a33] px-4 text-white shadow-lg lg:hidden">
        <div className="flex h-9 w-[118px] items-center justify-center rounded-xl bg-white px-2 shadow-sm">
          <img src="/LogoUniverso.png" alt="Universo" className="h-7 w-full object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white shadow-sm">
            {alunoInitials}
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
            aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm animate-fadeIn lg:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="flex h-full w-[86vw] max-w-[320px] flex-col bg-[#001a33] p-4 text-white shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Menu do portal do aluno">
             <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
               <div className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-white px-3">
                 <img src="/LogoUniverso.png" alt="Universo" className="h-9 w-full object-contain" />
               </div>
               <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300" aria-label="Fechar menu">
                 <X size={21} />
               </button>
             </div>
             
             <nav className="mt-4 flex-1 space-y-1 overflow-y-auto overscroll-contain pb-4">
               {menuItems.map((item) => (
                 <button
                   key={item.id}
                   onClick={() => { setActiveModule(item.id); setIsMobileMenuOpen(false); }}
                   className={`flex min-h-12 w-full items-center justify-between rounded-xl px-4 py-3 transition-all ${
                     activeModule === item.id ? 'bg-blue-600 font-bold text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:text-white'
                   }`}
                 >
                   <div className="flex items-center gap-3">
                     <div className="relative">
                       {item.icon}
                       {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                         <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center px-0.5 shadow-md animate-pulse">
                           {(item as any).badge > 99 ? '99+' : (item as any).badge}
                         </span>
                       )}
                     </div>
                     <span className="text-sm tracking-wide">{item.label}</span>
                   </div>
                   {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                     <span className="text-[8px] font-black bg-red-500 text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                       {(item as any).badge > 99 ? '99+' : (item as any).badge}
                     </span>
                   )}
                 </button>
               ))}
              </nav>

             <div className="space-y-3 border-t border-white/10 pt-4">
               <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
                 <div className="w-10 h-10 shrink-0 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white shadow-md">
                   {alunoInitials}
                 </div>
                 <div className="min-w-0">
                   <p className="truncate text-xs font-black">{alunoNome}</p>
                   <p className="truncate text-[10px] font-medium text-slate-400" title={alunoEmail}>{alunoEmail}</p>
                 </div>
               </div>
               <button 
                 onClick={() => { setIsMobileMenuOpen(false); void handleLogout(); }}
                 className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 py-3 rounded-xl transition-all text-sm font-bold uppercase tracking-wider"
               >
                 <LogOut size={18} />
                 <span>Sair</span>
               </button>
             </div>
          </aside>
        </div>
      )}

      {/* Main View Area */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden pt-16 lg:pt-0">
        
        {/* Portal Header */}
        <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-slate-200 bg-white px-8 py-4 shadow-sm lg:flex">
          <div className="flex items-center gap-3">
             <h2 className="text-lg font-black text-[#001a33] uppercase tracking-tight">
              Portal do Aluno
             </h2>
             
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-[#001a33]">{alunoNome}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Aluno</p>
            </div>
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-slate-200 shadow-sm">
              {alunoInitials}
            </div>
          </div>
        </header>

        {/* Dynamic page contents wrapper */}
        <div ref={contentScrollRef} className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-slate-50 p-4 pb-8 sm:p-6 lg:p-8">
          
          <Suspense fallback={<AlunoModuleLoading />}>
            {renderContent()}
          </Suspense>
        </div>
      </main>

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
    </div>
  );
};

export default AlunoPage;
