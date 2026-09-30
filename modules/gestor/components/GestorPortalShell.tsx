import React, { Suspense } from 'react';
import { ChevronDown, ChevronRight, Clock, LogOut, Menu, X } from 'lucide-react';
import { PortalAuthProfile } from '../../login/portal-session';
import ConfirmModal from '../../shared/components/ConfirmModal';
import GestorPortalHeader, { GestorPoloHeaderOption } from './GestorPortalHeader';
import type { GestorGlobalSearchResult } from '../global-search/gestor-global-search.types';

export interface GestorMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
  dividerBefore?: boolean;
  badge?: number;
  subItems?: Array<{ id: string; label: string; icon: React.ReactNode }>;
}

interface GestorPortalShellProps {
  profile: PortalAuthProfile;
  profileAvatarUrl: string | null;
  visibleMenuItems: GestorMenuItem[];
  activeModule: string;
  setActiveModule: (moduleId: string) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  expandedMenus: Set<string>;
  toggleMenu: (menuId: string) => void;
  isDesktopMenuExpanded: (menuId: string) => boolean;
  preloadModule: (moduleId: string) => void;
  handleLogout: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: GestorGlobalSearchResult[];
  isSearchFocused: boolean;
  setIsSearchFocused: (focused: boolean) => void;
  isSearchLoading: boolean;
  isSearchError: boolean;
  isSearchReady: boolean;
  isSearchAvailable: boolean;
  retrySearch: () => void;
  handleSearchResultClick: (result: GestorGlobalSearchResult) => void | Promise<void>;
  isLoadingPolos: boolean;
  currentPolo?: GestorPoloHeaderOption;
  visiblePolos: GestorPoloHeaderOption[];
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

const GestorPortalShell: React.FC<GestorPortalShellProps> = ({
  profile,
  profileAvatarUrl,
  visibleMenuItems,
  activeModule,
  setActiveModule,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  expandedMenus,
  toggleMenu,
  isDesktopMenuExpanded,
  preloadModule,
  handleLogout,
  searchQuery,
  setSearchQuery,
  searchResults,
  isSearchFocused,
  setIsSearchFocused,
  isSearchLoading,
  isSearchError,
  isSearchReady,
  isSearchAvailable,
  retrySearch,
  handleSearchResultClick,
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
        <div className="border-b border-white/10 px-5 py-3">
          <div className="flex h-[60px] items-center justify-center rounded-2xl bg-white px-4 py-2 shadow-md">
            <img
              src="/LogoUniverso.png"
              alt="Universo Cursos e Consultoria"
              className="h-10 w-full max-w-[180px] object-contain"
            />
          </div>
        </div>

        <nav className="custom-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 py-2 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/30 [&::-webkit-scrollbar-track]:bg-transparent">
          {visibleMenuItems.map((item, index) => (
            <div
              key={item.id}
              className="space-y-0.5 relative"
              onMouseEnter={() => preloadModule(item.id)}
            >
              {index > 0 && item.dividerBefore && (
                <div aria-hidden="true" className="mx-4 my-1.5 h-px bg-white/10" />
              )}
              <button
                onClick={() => {
                  if (item.subItems) toggleMenu(item.id);
                  else setActiveModule(item.id);
                }}
                onFocus={() => preloadModule(item.id)}
                onTouchStart={() => preloadModule(item.id)}
                aria-expanded={item.subItems ? isDesktopMenuExpanded(item.id) : undefined}
                className={`group flex min-h-11 w-full items-center justify-between rounded-xl px-4 py-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
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
                  <span className="text-sm whitespace-nowrap">{item.label}</span>
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
            <button
              type="button"
              onClick={() => setActiveModule('meu-perfil')}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              title="Abrir Meu Perfil"
            >
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl bg-blue-600 text-white shadow-md">
                {profileAvatarUrl ? (
                  <img src={profileAvatarUrl} alt={`Foto de ${profile.nome}`} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-black">
                    {(profile?.nome || 'Administrador').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {profile?.nome || 'Administrador'}
                </p>
                <p className="text-[10px] text-slate-400 truncate mt-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Sessão ativa
                </p>
              </div>
            </button>
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
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex h-11 w-11 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="flex h-dvh w-[min(20rem,88vw)] flex-col bg-[#001a33] p-4 text-white shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="mb-3 flex items-center gap-2">
               <div className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-white px-3 py-2">
                 <img src="/LogoUniverso.png" alt="Universo" className="h-8 object-contain" />
               </div>
               <button
                 type="button"
                 onClick={() => setIsMobileMenuOpen(false)}
                 className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                 aria-label="Fechar menu"
               >
                 <X size={22} />
               </button>
             </div>
             <nav className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
              {visibleMenuItems.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && item.dividerBefore && (
                    <div aria-hidden="true" className="mx-4 my-1.5 h-px bg-white/10" />
                  )}
                  <button
                    onClick={() => {
                      if (item.subItems) toggleMenu(item.id);
                      else { setActiveModule(item.id); setIsMobileMenuOpen(false); }
                    }}
                    onFocus={() => preloadModule(item.id)}
                    onTouchStart={() => preloadModule(item.id)}
                    aria-expanded={item.subItems ? expandedMenus.has(item.id) : undefined}
                    className={`flex min-h-11 w-full items-center justify-between rounded-xl px-4 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
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
                      <span className="whitespace-nowrap">{item.label}</span>
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
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModule('meu-perfil');
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  title="Abrir Meu Perfil"
                >
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl bg-blue-600 text-white shadow-md">
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} alt={`Foto de ${profile.nome}`} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-black">
                        {(profile?.nome || 'Administrador').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold leading-tight text-white">
                      {profile?.nome || 'Administrador'}
                    </p>
                    <p className="mt-1 whitespace-nowrap text-[10px] text-slate-400">Meu Perfil</p>
                  </div>
                </button>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="rounded-xl p-2 text-slate-400 transition-all duration-200 hover:bg-red-500/10 hover:text-red-400"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-auto relative w-full lg:pt-0 pt-16 flex flex-col">
        <GestorPortalHeader
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          isSearchFocused={isSearchFocused}
          setIsSearchFocused={setIsSearchFocused}
          isSearchLoading={isSearchLoading}
          isSearchError={isSearchError}
          isSearchReady={isSearchReady}
          isSearchAvailable={isSearchAvailable}
          retrySearch={retrySearch}
          handleSearchResultClick={handleSearchResultClick}
          isLoadingPolos={isLoadingPolos}
          currentPolo={currentPolo}
          visiblePolos={visiblePolos}
          currentPoloId={currentPoloId}
          isPoloSelectorOpen={isPoloSelectorOpen}
          setIsPoloSelectorOpen={setIsPoloSelectorOpen}
          handlePoloChange={handlePoloChange}
          formattedDate={formattedDate}
          formattedDayOfWeek={formattedDayOfWeek}
        />

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
