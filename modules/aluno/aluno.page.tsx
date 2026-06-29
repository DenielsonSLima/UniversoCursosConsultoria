import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { clearPortalSession, getPortalProfile, PortalAuthProfile } from '../login/portal-session';
import { supabase } from '../../lib/supabase';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import ConfirmModal from '../shared/components/ConfirmModal';
// Sub-módulos do Aluno
import InicioPage from './inicio/InicioPage';
import TurmasPage from './turmas/TurmasPage';
import CursosPage from './cursos/CursosPage';
import FinanceiroPage from './financeiro/FinanceiroPage';
import BibliotecaPage from './biblioteca/BibliotecaPage';
import ComunicacaoPage from './comunicacao/ComunicacaoPage';
import PerfilPage from './perfil/PerfilPage';
import SecretariaPage from './secretaria/SecretariaPage';
import CalendarioAlunoPage from './calendario/CalendarioAlunoPage';

const AlunoPage: React.FC = () => {
  const navigate = useNavigate();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [activeModule, setActiveModule] = useState('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadChatsCount, setUnreadChatsCount] = useState(0);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
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

  const alunoId = profile?.id || '';
  const alunoNome = profile?.nome || '';
  const alunoEmail = profile?.email || '';

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
        setIsAuthLoading(false);
      } catch {
        clearPortalSession();
        await loginService.logout().catch(() => undefined);
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        navigate(`/login?redirect=${redirect}`, { replace: true });
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
        return <InicioPage alunoId={alunoId} alunoNome={alunoNome} onNavigate={setActiveModule} />;
      case 'turmas':
        return <TurmasPage alunoId={alunoId} />;
      case 'cursos':
        return <CursosPage alunoId={alunoId} />;
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
        return <PerfilPage alunoId={alunoId} />;
      default:
        return <InicioPage alunoId={alunoId} alunoNome={alunoNome} onNavigate={setActiveModule} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      
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

        {/* User Card */}
        <div className="p-4.5 border-b border-white/5 mx-3 mt-4 bg-white/5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white shadow-md">
            {alunoNome.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black truncate">{alunoNome}</p>
            <p className="text-[10px] text-slate-400 font-medium truncate">{alunoEmail}</p>
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

        <div className="p-4 border-t border-white/10">
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
      <div className="lg:hidden fixed top-0 w-full bg-[#001a33] text-white z-30 px-4 py-3 flex justify-between items-center shadow-lg">
        <div className="bg-white px-3 py-1 rounded-xl flex items-center justify-center h-8">
          <img src="/LogoUniverso.png" alt="Universo" className="h-6 object-contain" />
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40 animate-fadeIn" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="w-64 h-full bg-[#001a33] text-white shadow-2xl p-4 flex flex-col" onClick={e => e.stopPropagation()}>
             <div className="bg-white p-3 rounded-2xl flex items-center justify-center mb-4 mt-12">
               <img src="/LogoUniverso.png" alt="Universo" className="h-8 object-contain" />
             </div>
             
             <nav className="flex-1 overflow-y-auto space-y-2 mt-4">
               {menuItems.map((item) => (
                 <button
                   key={item.id}
                   onClick={() => { setActiveModule(item.id); setIsMobileMenuOpen(false); }}
                   className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
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

             <div className="border-t border-white/10 pt-4">
               <button 
                 onClick={handleLogout} 
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
      <main className="flex-1 overflow-auto relative w-full lg:pt-0 pt-16 flex flex-col">
        
        {/* Portal Header */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
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
              {alunoNome.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Dynamic page contents wrapper */}
        <div ref={contentScrollRef} className="p-8 flex-1 overflow-auto bg-slate-50">
          
          {renderContent()}
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
