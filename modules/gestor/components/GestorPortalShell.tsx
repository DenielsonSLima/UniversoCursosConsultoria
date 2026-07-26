import React, { Suspense } from 'react';
import { Building, CalendarDays, ChevronDown, ChevronRight, Clock, LogOut, Menu, Search, X } from 'lucide-react';
import { PortalAuthProfile } from '../../login/portal-session';
import ConfirmModal from '../../shared/components/ConfirmModal';

interface PoloOption {
  id: string;
  nome?: string;
  cidade?: string;
  estado?: string;
  cnpj?: string;
  is_matriz?: boolean;
}

interface SearchResult {
  id: number;
  type: string;
  title: string;
  subtitle: string;
  module: string;
}

export interface GestorMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  subItems?: Array<{ id: string; label: string; icon: React.ReactNode }>;
}

interface GestorPortalShellProps {
  profile: PortalAuthProfile;
  visibleMenuItems: GestorMenuItem[];
  activeModule: string;
  setActiveModule: (moduleId: string) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  expandedMenus: Set<string>;
  toggleMenu: (menuId: string) => void;
  setMenuHovered: (menuId: string, hovered: boolean) => void;
  isDesktopMenuExpanded: (menuId: string) => boolean;
  preloadModule: (moduleId: string) => void;
  handleLogout: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  isSearchFocused: boolean;
  setIsSearchFocused: (focused: boolean) => void;
  handleSearchResultClick: (moduleId: string) => void;
  getResultIcon: (type: string) => React.ReactNode;
  isLoadingPolos: boolean;
  currentPolo?: PoloOption;
  visiblePolos: PoloOption[];
  currentPoloId: string | null;
  isPoloSelectorOpen: boolean;
  setIsPoloSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handlePoloChange: (poloId: string) => void;
  formattedDate: string;
  formattedDayOfWeek: string;
  contentScrollRef: React.RefObject<HTMLDivElement | null>;
  renderContent: () => React.ReactNode;
  isLogoutConfirmOpen: boolean;
  setIsLogoutConfirmOpen: (open: boolean) => void;
  executeLogout: () => void | Promise<void>;
}

const formatPoloLocation = (polo: PoloOption) =>
  [polo.cidade, polo.estado].filter(Boolean).join(' - ');

const formatPoloDetails = (polo: PoloOption) =>
  [polo.cnpj, formatPoloLocation(polo)].filter(Boolean).join(' • ');

const GestorPortalShell: React.FC<GestorPortalShellProps> = ({
  profile,
  visibleMenuItems,
  activeModule,
  setActiveModule,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  expandedMenus,
  toggleMenu,
  setMenuHovered,
  isDesktopMenuExpanded,
  preloadModule,
  handleLogout,
  searchQuery,
  setSearchQuery,
  searchResults,
  isSearchFocused,
  setIsSearchFocused,
  handleSearchResultClick,
  getResultIcon,
  isLoadingPolos,
  currentPolo,
  visiblePolos,
  currentPoloId,
  isPoloSelectorOpen,
  setIsPoloSelectorOpen,
  handlePoloChange,
  formattedDate,
  formattedDayOfWeek,
  contentScrollRef,
  renderContent,
  isLogoutConfirmOpen,
  setIsLogoutConfirmOpen,
  executeLogout,
}) => {
  return (
    <div className="flex h-screen bg-slate-100 font-sans antialiased overflow-hidden">

      <aside className="hidden lg:flex flex-col w-64 bg-[#001a33] text-white shadow-xl z-20">
        <div className="px-5 py-4 border-b border-white/10">
          <div className="bg-white h-[70px] px-4 py-2.5 rounded-2xl shadow-md flex items-center justify-center">
            <img
              src="/LogoUniverso.png"
              alt="Universo Cursos e Consultoria"
              className="h-12 w-full max-w-[190px] object-contain"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5 custom-scrollbar">
          {visibleMenuItems.map((item) => (
            <div
              key={item.id}
              className="space-y-0.5 relative"
              onMouseEnter={() => {
                preloadModule(item.id);
                if (item.subItems) setMenuHovered(item.id, true);
              }}
              onMouseLeave={() => item.subItems && setMenuHovered(item.id, false)}
            >
              <button
                onClick={() => {
                  if (item.subItems) toggleMenu(item.id);
                  else setActiveModule(item.id);
                }}
                onFocus={() => preloadModule(item.id)}
                onTouchStart={() => preloadModule(item.id)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                  activeModule === item.id || (item.subItems && activeModule.startsWith(item.id))
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 font-semibold'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white font-normal'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`relative ${(activeModule === item.id || (item.subItems && activeModule.startsWith(item.id))) ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`}>
                    {item.icon}
                    {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 shadow-md animate-pulse">
                        {(item as any).badge > 99 ? '99+' : (item as any).badge}
                      </span>
                    )}
                  </div>
                  <span className="text-sm">{item.label}</span>
                </div>
                {item.subItems && (
                  <div className="transition-transform duration-300">
                    {isDesktopMenuExpanded(item.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                )}
                {'badge' in item && (item as any).badge > 0 && activeModule !== item.id && (
                  <span className="text-[9px] font-bold bg-red-500 text-white rounded-full min-w-[18px] h-4 flex items-center justify-center px-1">
                    {(item as any).badge > 99 ? '99+' : (item as any).badge}
                  </span>
                )}
              </button>

              {item.subItems && (
                <div className={`grid transition-all duration-300 ease-in-out ${
                  isDesktopMenuExpanded(item.id) ? 'grid-rows-[1fr] opacity-100 mt-0.5' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
                }`}>
                  <div className="overflow-hidden pl-6 space-y-0.5">
                    {item.subItems.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => setActiveModule(sub.id)}
                        className={`w-full flex items-center gap-3 px-4 py-1.5 rounded-lg text-xs transition-all ${
                          activeModule === sub.id
                            ? 'text-blue-400 bg-white/5 font-semibold'
                            : 'text-slate-500 hover:text-white hover:bg-white/5 font-normal'
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

        <div className="p-4 border-t border-white/10 mt-auto">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md flex-shrink-0">
                {(profile?.nome || 'Administrador').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {profile?.nome || 'Administrador'}
                </p>
                <p className="text-[10px] text-slate-400 truncate mt-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Online
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200"
            >
              <LogOut size={16} />
            </button>
          </div>
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
              {visibleMenuItems.map((item) => (
                <div key={item.id}>
                  <button
                    onClick={() => {
                      if (item.subItems) toggleMenu(item.id);
                      else { setActiveModule(item.id); setIsMobileMenuOpen(false); }
                    }}
                    onFocus={() => preloadModule(item.id)}
                    onTouchStart={() => preloadModule(item.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl ${
                      activeModule === item.id || (item.subItems && activeModule.startsWith(item.id))
                        ? 'bg-blue-600 font-bold'
                        : 'text-slate-400'
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
        <header className="sticky top-0 z-30 flex min-h-[84px] items-center justify-between border-b border-slate-200 bg-white px-8 py-3 shadow-sm">
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

            <div className="relative hidden h-12 w-[23rem] md:block">
              {isLoadingPolos || !currentPolo ? (
                <div className="flex h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                  <div className="h-7 w-7 flex-shrink-0 rounded-lg bg-slate-100 animate-pulse" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-2.5 w-4/5 rounded-full bg-slate-200/80" />
                    <div className="h-2 w-3/5 rounded-full bg-slate-200/70" />
                  </div>
                </div>
              ) : (
              <div
                className="h-12 w-full"
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
                  disabled={visiblePolos.length <= 1}
                  className="flex h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-left transition-all hover:bg-slate-50 hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 disabled:cursor-default disabled:hover:bg-white disabled:hover:border-slate-200 shadow-sm"
                >
                  <Building size={16} className="text-blue-600 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-bold text-slate-800 tracking-tight">
                        {currentPolo?.nome}
                      </span>
                      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                        currentPolo?.is_matriz
                          ? 'bg-blue-50 text-blue-600 border border-blue-200/50'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {currentPolo?.is_matriz ? 'Matriz' : 'Polo'}
                      </span>
                    </span>
                    <span className="block truncate text-[10px] text-slate-500 mt-0.5 font-normal">
                      {formatPoloDetails(currentPolo)}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 flex-shrink-0 transition-transform ${visiblePolos.length <= 1 ? 'opacity-0' : ''} ${
                      isPoloSelectorOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isPoloSelectorOpen && (
                  <div
                    role="listbox"
                    className="absolute top-full right-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/15 animate-fadeIn"
                  >
                    {visiblePolos.map(polo => {
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
                              ? 'bg-blue-50/60 text-blue-900'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                                isSelected ? 'bg-blue-600' : 'bg-slate-300'
                              }`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className={`truncate text-xs tracking-tight ${isSelected ? 'font-bold text-blue-900' : 'font-semibold text-slate-700'}`}>
                                  {polo.nome}
                                </span>
                                <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                                  polo.is_matriz
                                    ? 'bg-blue-100/50 text-blue-700'
                                    : 'bg-slate-200/50 text-slate-600'
                                }`}>
                                  {polo.is_matriz ? 'Matriz' : 'Polo'}
                                </span>
                              </span>
                              <span className="block truncate text-[10px] text-slate-500 mt-0.5 font-normal">
                                {formatPoloDetails(polo)}
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
            </div>

            <div className="w-px h-8 bg-slate-200 hidden sm:block"></div>

            <div className="flex items-center gap-2.5 pl-4 hidden sm:flex text-left">
              <CalendarDays size={18} className="text-amber-500 flex-shrink-0" />
              <div className="flex flex-col justify-center">
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  {formattedDate}
                </span>
                <span className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                  {formattedDayOfWeek}
                </span>
              </div>
            </div>

          </div>
        </header>

        <div ref={contentScrollRef} className="p-8 flex-1 overflow-auto">
          <Suspense fallback={(
            <div className="flex min-h-[420px] items-center justify-center gap-3 text-xs font-black uppercase tracking-widest text-slate-500">
              <Clock className="animate-pulse text-blue-600" size={24} /> Preparando módulo...
            </div>
          )}>
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

export default GestorPortalShell;
