
// File: modules/gestor/gestor.page.tsx

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Handshake, 
  UserPlus, 
  Briefcase, 
  FileText, 
  ShoppingCart, 
  TrendingUp, 
  BookOpen, 
  BarChart, 
  Settings, 
  LogOut,
  Menu,
  X,
  Search,
  ChevronRight,
  ChevronDown,
  User,
  CreditCard,
  CalendarDays,
  ClipboardCheck,
  FileCode,
  MonitorPlay,
  Zap,
  Award,
  FileSignature,
  Building,
  MessageSquare,
  LayoutGrid,
  GraduationCap,
  Users
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { polosService } from './configuracoes/polos/polos.service';
import { supabase } from '../../lib/supabase';

// Importação dos Submódulos
import DashboardPage from './dashboard/DashboardPage';
import ParceirosPage from './parceiros/ParceirosPage';
import ParceiroDocumentosPage from './parceiros/ParceiroDocumentosPage';
import CadastrosPage from './cadastros/CadastrosPage';
import GestaoPage from './gestao/GestaoPage';
import SecretariaPage from './secretaria/SecretariaPage';
import CaixaPage from './caixa/CaixaPage';
import FinanceiroPage from './financeiro/FinanceiroPage';
import BibliotecaPage from './biblioteca/BibliotecaPage';
import CalendarioPage from './calendario/CalendarioPage';
import RelatoriosPage from './relatorios/RelatoriosPage';
import ConfiguracoesPage from './configuracoes/ConfiguracoesPage';
import ComunicacaoPage from './comunicacao/ComunicacaoPage';

// Importação dos Novos Submódulos de Cadastros
import ModelosDocumentosPage from './cadastros/modelos-documentos/ModelosDocumentosPage';
import CursosEadPage from './cadastros/cursos-ead/CursosEadPage';
import CursosTecnicosPage from './cadastros/cursos-tecnicos/CursosTecnicosPage';
import CursosLivresPage from './cadastros/cursos-livres/CursosLivresPage';
import EnsinoSuperiorPage from './cadastros/ensino-superior/EnsinoSuperiorPage';
import CursosEspecializacaoPage from './cadastros/cursos-especializacao/CursosEspecializacaoPage';
import ChecklistEstagioPage from './cadastros/checklist-estagio/ChecklistEstagioPage';
import FichaMatriculaPage from './cadastros/ficha-matricula/FichaMatriculaPage';

import { loginService } from '../login/login.service';

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
  const [activeModule, setActiveModule] = useState('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof MOCK_SEARCH_DATA>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // ─── Badge de chamados pendentes ───────────────────────────────────────────
  const [pendingChatsCount, setPendingChatsCount] = useState(0);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // current_polo_id: estado de sessão UI (polo selecionado) — usa sessionStorage pois não é dado compartilhado entre usuários
  const [currentPoloId, setCurrentPoloId] = useState<string | null>(() => sessionStorage.getItem('current_polo_id'));

  const { data: activePolos = [] } = useQuery<any[]>({
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
    }
  });

  useEffect(() => {
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
  }, [queryClient]);

  // ─── Carregar contagem inicial de chamados não lidos (mensagens de aluno/professor com lida = false) ───
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const { data } = await supabase
          .from('comunicacao_mensagens')
          .select('chat_id')
          .eq('lida', false)
          .in('remetente_tipo', ['aluno', 'professor']);
        const uniqueChatIds = new Set(data?.map(m => m.chat_id) || []);
        setPendingChatsCount(uniqueChatIds.size);
      } catch (err) {
        console.error('Erro ao buscar contagem de chamados pendentes:', err);
      }
    };
    fetchPending();
  }, []);

  // ─── Realtime: manter badge de chamados não lidos atualizado em tempo real ───
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const { data } = await supabase
          .from('comunicacao_mensagens')
          .select('chat_id')
          .eq('lida', false)
          .in('remetente_tipo', ['aluno', 'professor']);
        const uniqueChatIds = new Set(data?.map(m => m.chat_id) || []);
        setPendingChatsCount(uniqueChatIds.size);
      } catch (err) {
        console.error('Erro ao buscar contagem de chamados pendentes (realtime):', err);
      }
    };

    const badgeChannel = supabase
      .channel('sidebar_pending_badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comunicacao_mensagens' },
        () => {
          fetchPending();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(badgeChannel);
    };
  }, []);

  useEffect(() => {
    if (activePolos.length > 0) {
      const isValid = activePolos.some(p => p.id === currentPoloId);
      if (!isValid) {
        const matriz = activePolos.find(p => p.is_matriz) || activePolos[0];
        setCurrentPoloId(matriz.id || null);
        if (matriz.id) {
          sessionStorage.setItem('current_polo_id', matriz.id);
        }
      }
    }
  }, [activePolos, currentPoloId]);

  const handlePoloChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCurrentPoloId(val);
    sessionStorage.setItem('current_polo_id', val);
  };

  const handleLogout = async () => {
    await loginService.logout();
    navigate('/login');
  };

  const toggleMenu = (menuId: string) => {
    const newExpanded = new Set(expandedMenus);
    if (newExpanded.has(menuId)) {
      newExpanded.delete(menuId);
    } else {
      newExpanded.add(menuId);
    }
    setExpandedMenus(newExpanded);
  };

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      return;
    }
    const filtered = MOCK_SEARCH_DATA.filter(item => 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSearchResults(filtered);
  }, [searchQuery]);

  const handleSearchResultClick = (module: string) => {
    setActiveModule(module);
    setSearchQuery('');
    setIsSearchFocused(false);
  };

  const menuItems = [
    { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={20} /> },
    { id: 'parceiros', label: 'Parceiros', icon: <Handshake size={20} /> },
    { 
      id: 'cadastros', 
      label: 'Cadastros', 
      icon: <UserPlus size={20} />,
      subItems: [
        { id: 'cadastros-checklist', label: 'Check List Estágio', icon: <ClipboardCheck size={16} /> },
        { id: 'cadastros-ead', label: 'Cursos EAD', icon: <MonitorPlay size={16} /> },
        { id: 'cadastros-especializacao', label: 'Cursos Especialização', icon: <Award size={16} /> },
        { id: 'cadastros-livres', label: 'Cursos Livres', icon: <Zap size={16} /> },
        { id: 'cadastros-tecnicos', label: 'Cursos Técnicos', icon: <Briefcase size={16} /> },
        { id: 'cadastros-superior', label: 'Ensino Superior', icon: <Building size={16} /> },
        { id: 'cadastros-ficha', label: 'Ficha Matrícula', icon: <FileSignature size={16} /> },
        { id: 'cadastros-modelos', label: 'Modelos Documentos', icon: <FileCode size={16} /> },
      ]
    },
    { id: 'gestao', label: 'Gestão', icon: <Briefcase size={20} /> },
    { id: 'secretaria', label: 'Secretaria', icon: <FileText size={20} /> },
    { id: 'caixa', label: 'Caixa', icon: <ShoppingCart size={20} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <TrendingUp size={20} /> },
    { id: 'biblioteca', label: 'Biblioteca', icon: <BookOpen size={20} /> },
    { id: 'calendario', label: 'Calendário', icon: <CalendarDays size={20} /> },
    { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={20} />, badge: pendingChatsCount },
    { id: 'relatorios', label: 'Relatórios', icon: <BarChart size={20} /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings size={20} /> },
  ];

  const renderContent = () => {
    switch (activeModule) {
      case 'inicio': return <DashboardPage poloId={currentPoloId} onNavigate={setActiveModule} />;
      case 'calendario': return <CalendarioPage />;
      case 'parceiros': return <ParceirosPage />;
      case 'cadastros': return <CadastrosPage onNavigate={(id) => setActiveModule(id)} />;
      case 'cadastros-checklist': return <ChecklistEstagioPage />;
      case 'cadastros-ead': return <CursosEadPage />;
      case 'cadastros-especializacao': return <CursosEspecializacaoPage />;
      case 'cadastros-livres': return <CursosLivresPage />;
      case 'cadastros-tecnicos': return <CursosTecnicosPage />;
      case 'cadastros-superior': return <EnsinoSuperiorPage />;
      case 'cadastros-ficha': return <FichaMatriculaPage />;
      case 'cadastros-modelos': return <ModelosDocumentosPage />;
      case 'gestao': return <GestaoPage />;
      case 'secretaria': return <SecretariaPage />;
      case 'caixa': return <CaixaPage />;
      case 'financeiro': return <FinanceiroPage />;
      case 'biblioteca': return <BibliotecaPage />;
      case 'comunicacao': return <ComunicacaoPage />;
      case 'relatorios': return <RelatoriosPage />;
      case 'configuracoes': return <ConfiguracoesPage />;
      
      default: 
        if (activeModule.startsWith('cadastros-')) {
          const sub = activeModule.split('-')[1];
          return (
            <div className="animate-fadeIn">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">
                  Gerenciamento de {sub.charAt(0).toUpperCase() + sub.slice(1)}
                </h2>
                <button onClick={() => setActiveModule('cadastros')} className="text-xs font-bold text-blue-600 hover:underline uppercase tracking-widest">
                  Ver todos os cadastros
                </button>
              </div>
              <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
                 <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Settings className="animate-spin-slow" />
                 </div>
                 <p className="text-slate-500 font-medium">O módulo de {sub} está sendo preparado para você.</p>
              </div>
            </div>
          );
        }
        return <DashboardPage poloId={currentPoloId} onNavigate={setActiveModule} />;
    }
  };

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
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      
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
            <div 
              key={item.id} 
              className="space-y-1 relative"
            >
              <button
                onClick={() => {
                  if (item.subItems) toggleMenu(item.id);
                  else setActiveModule(item.id);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                  activeModule === item.id || (item.subItems && activeModule.startsWith(item.id))
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 font-bold' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`relative ${(activeModule === item.id || (item.subItems && activeModule.startsWith(item.id))) ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`}>
                    {item.icon}
                    {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5 shadow-md animate-pulse">
                        {(item as any).badge > 99 ? '99+' : (item as any).badge}
                      </span>
                    )}
                  </div>
                  <span className="text-sm tracking-wide">{item.label}</span>
                </div>
                {item.subItems && (
                  <div className="transition-transform duration-300">
                    {(expandedMenus.has(item.id) || item.subItems.some(sub => sub.id === activeModule)) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                )}
                {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                  <span className="text-[9px] font-black bg-red-500 text-white rounded-full min-w-[18px] h-4 flex items-center justify-center px-1">
                    {(item as any).badge > 99 ? '99+' : (item as any).badge}
                  </span>
                )}
              </button>

              {item.subItems && (
                <div className={`grid transition-all duration-300 ease-in-out ${
                  (expandedMenus.has(item.id) || item.subItems.some(sub => sub.id === activeModule)) ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
                }`}>
                  <div className="overflow-hidden pl-6 space-y-1">
                    {item.subItems.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => setActiveModule(sub.id)}
                        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs transition-all ${
                          activeModule === sub.id 
                            ? 'text-blue-400 bg-white/5 font-bold' 
                            : 'text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {sub.icon}
                        <span>{sub.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 py-3 rounded-xl transition-all text-sm font-bold uppercase tracking-wider">
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 w-full bg-[#001a33] text-white z-30 px-4 py-2 flex justify-between items-center shadow-lg">
        <div className="bg-white px-3 py-1 rounded-xl flex items-center justify-center">
          <img src="/LogoUniverso.png" alt="Universo" className="h-6 object-contain" />
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="w-64 h-full bg-[#001a33] text-white shadow-2xl p-4 flex flex-col" onClick={e => e.stopPropagation()}>
             <div className="bg-white p-3 rounded-2xl flex items-center justify-center mb-4 mt-12">
               <img src="/LogoUniverso.png" alt="Universo" className="h-8 object-contain" />
             </div>
             <nav className="flex-1 overflow-y-auto space-y-2">
              {menuItems.map((item) => (
                <div key={item.id}>
                  <button
                    onClick={() => {
                      if (item.subItems) toggleMenu(item.id);
                      else { setActiveModule(item.id); setIsMobileMenuOpen(false); }
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl ${
                      activeModule === item.id ? 'bg-blue-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {item.icon}
                        {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center px-0.5">
                            {(item as any).badge > 99 ? '99+' : (item as any).badge}
                          </span>
                        )}
                      </div>
                      {item.label}
                    </div>
                    {item.subItems && (expandedMenus.has(item.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                    {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                      <span className="text-[8px] font-black bg-red-500 text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                        {(item as any).badge > 99 ? '99+' : (item as any).badge}
                      </span>
                    )}
                  </button>

                  {item.subItems && expandedMenus.has(item.id) && (
                    <div className="pl-6 space-y-1 mt-1">
                      {item.subItems.map(sub => (
                        <button
                          key={sub.id}
                          onClick={() => { setActiveModule(sub.id); setIsMobileMenuOpen(false); }}
                          className={`w-full text-left px-4 py-2 rounded-lg text-xs ${
                            activeModule === sub.id ? 'text-blue-400' : 'text-slate-500'
                          }`}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-auto relative w-full lg:pt-0 pt-16 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-4">
             <h2 className="text-xl font-bold text-[#001a33] uppercase tracking-tight flex items-center gap-2">
              <span className="hidden sm:inline">
                Portal de Gestão
              </span>
            </h2>
          </div>

          <div className="flex-1 max-w-lg mx-4 relative">
            <div className={`flex items-center bg-slate-100 rounded-xl px-4 py-2.5 border transition-all ${isSearchFocused ? 'border-blue-500 ring-2 ring-blue-100 bg-white' : 'border-transparent'}`}>
              <Search size={18} className="text-slate-400 mr-3" />
              <input 
                type="text"
                placeholder="Pesquisar..."
                className="bg-transparent border-none outline-none w-full text-sm text-slate-700 placeholder-slate-400 font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              />
            </div>

            {searchQuery && (
              <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-fadeIn">
                <div className="p-3">
                  {searchResults.length > 0 ? (
                    <div className="space-y-1">
                      {searchResults.map((result) => (
                        <button key={result.id} onClick={() => handleSearchResultClick(result.module)} className="w-full flex items-center justify-between p-3 hover:bg-blue-50 rounded-xl transition-colors text-left group">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-white transition-colors">
                              {getResultIcon(result.type)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-[#001a33]">{result.title}</p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wide">{result.subtitle}</p>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6"><p className="text-sm text-slate-500">Nenhum resultado.</p></div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            
            {activePolos.length > 1 && (
              <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg animate-fadeIn">
                <Building size={16} className="text-slate-400" />
                <select 
                  value={currentPoloId || ''} 
                  onChange={handlePoloChange}
                  className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 uppercase tracking-widest cursor-pointer"
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
                <p className="text-xs font-bold text-[#001a33]">Administrador</p>
                <p className="text-[10px] text-slate-500">gestor@universo.com</p>
              </div>
              <div className="w-10 h-10 bg-[#001a33] rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-slate-200 shadow-sm">AD</div>
            </div>
            
          </div>
        </header>

        <div className="p-8 flex-1 overflow-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default GestorPage;
