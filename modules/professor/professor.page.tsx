import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  GraduationCap, 
  CreditCard, 
  Library, 
  MessageSquare, 
  User, 
  LogOut, 
  Menu, 
  X,
  Building,
  ChevronDown,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { loginService } from '../login/login.service';
import { clearPortalSession, getPortalProfile, PortalAuthProfile } from '../login/portal-session';
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

const ProfessorPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeModule, setActiveModule] = useState('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentPoloId, setCurrentPoloId] = useState<string | null>(null);
  const [isPoloSelectorOpen, setIsPoloSelectorOpen] = useState(false);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const professorId = profile?.id || '';
  const professorNome = profile?.nome || '';
  const professorEmail = profile?.email || '';

  const formatPoloLocation = (polo: any) =>
    [polo?.cidade, polo?.estado].filter(Boolean).join(' - ');

  const formatPoloDetails = (polo: any) =>
    [polo?.cnpj ? `CNPJ: ${polo.cnpj}` : null, formatPoloLocation(polo)].filter(Boolean).join(' • ');

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
        navigate(`/sistema/login?redirect=${redirect}`, { replace: true });
      }
    };

    hydrateProfile();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Fetch active polos for seletor
  const { data: activePolos = [], isLoading: isLoadingActivePolos } = useQuery<any[]>({
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

  // Redireciona apenas depois da autenticação se o professor não tiver polo ativo.
  useEffect(() => {
    if (isAuthLoading || !profile) return;
    if (currentPoloId) return;
    if (isLoadingActivePolos) return;

    const fallbackPoloId = activePolos[0]?.id || null;
    if (fallbackPoloId) {
      setCurrentPoloId(fallbackPoloId);
      sessionStorage.setItem('active_polo_id', fallbackPoloId);
      return;
    }

    navigate('/sistema/login');
  }, [activePolos, currentPoloId, isAuthLoading, isLoadingActivePolos, navigate, profile]);

  const currentPolo = activePolos.find((polo) => polo.id === currentPoloId) || activePolos[0] || null;

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

  const menuItems = [
    { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={20} /> },
    { id: 'turmas', label: 'Disciplinas', icon: <GraduationCap size={20} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={20} /> },
    { id: 'biblioteca', label: 'Biblioteca', icon: <Library size={20} /> },
    { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={20} /> },
    { id: 'perfil', label: 'Meu Perfil', icon: <User size={20} /> },
  ];

  const renderContent = () => {
    switch (activeModule) {
      case 'inicio':
        return <InicioPage professorId={professorId} professorNome={professorNome} poloId={currentPoloId} onNavigate={setActiveModule} />;
      case 'turmas':
        return <TurmasPage professorId={professorId} />;
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
                  ? 'bg-[#092744] text-white shadow-lg shadow-purple-950/30 font-black border border-purple-400/35 ring-1 ring-purple-500/20' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'
              }`}
            >
              <div className={`${activeModule === item.id ? 'text-purple-300' : 'text-slate-400 group-hover:text-purple-400'}`}>
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
                    activeModule === item.id ? 'bg-[#092744] text-white font-black shadow-lg shadow-purple-950/30 border border-purple-400/35' : 'text-slate-400'
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
          </div>

          <div className="flex items-center gap-6">
            
            {currentPolo && (
              <div
                className="relative hidden h-14 w-[23rem] md:block"
                onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsPoloSelectorOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsPoloSelectorOpen(open => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={isPoloSelectorOpen}
                  disabled={activePolos.length <= 1}
                  className="flex h-14 w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left transition-all hover:border-purple-200 hover:bg-white focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
                >
                  <Building size={16} className="shrink-0 text-purple-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-extrabold uppercase tracking-wide text-[#001a33]">
                      {currentPolo.nome}
                    </span>
                    <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wide text-slate-500">
                      {formatPoloDetails(currentPolo) || 'Dados do polo não informados'}
                    </span>
                  </span>
                  <ChevronDown
                    size={15}
                    className={`shrink-0 text-slate-400 transition-transform ${activePolos.length <= 1 ? 'opacity-0' : ''} ${
                      isPoloSelectorOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isPoloSelectorOpen && (
                  <div
                    role="listbox"
                    className="absolute right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/15 animate-fadeIn"
                  >
                    {activePolos.map((polo) => {
                      const isSelected = polo.id === currentPoloId;

                      return (
                        <button
                          key={polo.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handlePoloChange(polo.id)}
                          className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'bg-purple-50 text-purple-950'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-start gap-2">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isSelected ? 'bg-purple-650' : 'bg-slate-300'}`} />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-extrabold uppercase tracking-wide">
                                {polo.nome}
                              </span>
                              <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wide text-slate-500">
                                {formatPoloDetails(polo) || 'Dados do polo não informados'}
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
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

export default ProfessorPage;
