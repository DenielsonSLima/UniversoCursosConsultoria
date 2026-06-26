import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Sparkles,
  Building,
  AlertTriangle
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { loginService } from '../login/login.service';
import { clearPortalSession, getPortalProfile, PortalAuthProfile } from '../login/portal-session';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';

// Sub-módulos do Professor
import InicioPage from './inicio/InicioPage';
import TurmasPage from './turmas/TurmasPage';
import CursosPage from './cursos/CursosPage';
import FinanceiroPage from './financeiro/FinanceiroPage';
import BibliotecaPage from './biblioteca/BibliotecaPage';
import ComunicacaoPage from './comunicacao/ComunicacaoPage';
import PerfilPage from './perfil/PerfilPage';

const ProfessorPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeModule, setActiveModule] = useState('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentPoloId, setCurrentPoloId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const professorId = profile?.id || '';
  const professorNome = profile?.nome || '';
  const professorEmail = profile?.email || '';

  useEffect(() => {
    let mounted = true;

    const hydrateProfile = async () => {
      try {
        const portalProfile = await getPortalProfile();
        if (!mounted) return;

        if (!portalProfile || portalProfile.tipo !== 'Professor') {
          clearPortalSession();
          await loginService.logout().catch(() => undefined);
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          navigate(`/login?redirect=${redirect}`, { replace: true });
          return;
        }

        const allowedPolos = (portalProfile.poloIds || []).filter(Boolean);
        const preferredPolo =
          portalProfile.activePoloId ||
          (allowedPolos.length === 1 ? allowedPolos[0] : null);

        setCurrentPoloId(preferredPolo || null);
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

  // Fetch active polos for seletor
  const { data: activePolos = [] } = useQuery<any[]>({
    queryKey: ['professor-active-polos', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polos')
        .select('*')
        .eq('status', 'ativo')
        .order('nome', { ascending: true });
      if (error) throw error;
      const polos = data || [];

      if (!profile?.poloIds?.length) {
        return polos;
      }

      return polos.filter((polo) => profile?.poloIds?.includes(polo.id));
    }
  });

  // Redireciona se não houver polo ativo e não estivermos em desenvolvimento
  useEffect(() => {
    const mode = import.meta.env.VITE_APP_MODE;
    const activePolo = sessionStorage.getItem('active_polo_id');
    if (!activePolo && mode !== 'development') {
      navigate('/login');
    }
  }, [navigate]);

  const handlePoloChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCurrentPoloId(val);
    sessionStorage.setItem('active_polo_id', val);
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
    navigate('/login');
  };

  useInactivityLogout({
    isEnabled: !!profile && !isAuthLoading,
    onTimeout: executeLogout,
  });

  if (isAuthLoading || !profile) {
    return <AccessCheckingScreen portal="Professor" />;
  }

  const handleLogout = async () => {
    await executeLogout();
  };

  const menuItems = [
    { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={20} /> },
    { id: 'turmas', label: 'Disciplinas', icon: <GraduationCap size={20} /> },
    { id: 'cursos', label: 'Ementas Cursos', icon: <BookOpen size={20} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={20} /> },
    { id: 'biblioteca', label: 'Biblioteca', icon: <Library size={20} /> },
    { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={20} /> },
    { id: 'perfil', label: 'Meu Perfil', icon: <User size={20} /> },
  ];

  const renderContent = () => {
    switch (activeModule) {
      case 'inicio':
        return <InicioPage professorId={professorId} professorNome={professorNome} onNavigate={setActiveModule} />;
      case 'turmas':
        return <TurmasPage professorId={professorId} />;
      case 'cursos':
        return <CursosPage />;
      case 'financeiro':
        return <FinanceiroPage professorId={professorId} />;
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
          <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center font-bold text-white shadow-md">
            {professorNome.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black truncate">{professorNome}</p>
            <p className="text-[10px] text-slate-450 font-medium truncate">{professorEmail}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group ${
                activeModule === item.id 
                  ? 'bg-purple-650 text-white shadow-lg shadow-purple-900/50 font-bold' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'
              }`}
            >
              <div className={`${activeModule === item.id ? 'text-white' : 'text-slate-400 group-hover:text-purple-400'}`}>
                {item.icon}
              </div>
              <span className="text-sm tracking-wide">{item.label}</span>
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeModule === item.id ? 'bg-purple-650 font-bold' : 'text-slate-400'
                  }`}
                >
                  {item.icon}
                  <span className="text-sm">{item.label}</span>
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
              Portal do Professor
             </h2>
             
             {/* Elegant "In Development" Badge */}
             <div className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-150 animate-pulse">
               <Sparkles size={9} />
               <span>Desenvolvimento</span>
             </div>
          </div>

          <div className="flex items-center gap-6">
            
            {/* Polo Seletor for teachers */}
            {activePolos.length > 0 && (
              <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                <Building size={16} className="text-slate-400" />
                <select 
                  value={currentPoloId || ''} 
                  onChange={handlePoloChange}
                  className="bg-transparent border-none outline-none text-[10px] font-black text-slate-700 uppercase tracking-wider cursor-pointer"
                >
                  {activePolos.map(polo => (
                    <option key={polo.id} value={polo.id}>
                      {polo.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="w-px h-8 bg-slate-200 hidden sm:block"></div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-[#001a33]">{professorNome}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Docente</p>
              </div>
              <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-slate-200 shadow-sm">
                {professorNome.slice(0, 2).toUpperCase()}
              </div>
            </div>
            
          </div>
        </header>

        {/* Dynamic page contents wrapper */}
        <div className="p-8 flex-1 overflow-auto bg-slate-50">
          
          {/* Warning banner indicating active development state */}
          <div className="mb-6 p-4.5 bg-amber-50/40 border border-amber-100 rounded-3xl flex items-start gap-3 text-xs text-amber-800">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Portal em Homologação</p>
              <p className="text-[11px] text-slate-655 mt-0.5">
                Você está visualizando a área do professor em ambiente de testes. Todas as conexões ao Supabase e notificações em tempo real estão ativas.
              </p>
            </div>
          </div>

          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default ProfessorPage;
