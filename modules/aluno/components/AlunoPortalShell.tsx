import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  BookOpen,
  CalendarDays,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  User,
  X,
} from 'lucide-react';
import AlunoMobileBottomNav from './mobile/AlunoMobileBottomNav';

type AlunoMenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

type AlunoPortalShellProps = {
  activeModule: string;
  alunoEmail: string;
  alunoNome: string;
  canViewCalendar: boolean;
  children: ReactNode;
  contentScrollRef: RefObject<HTMLDivElement | null>;
  isMobileMenuOpen: boolean;
  unreadChatsCount: number;
  onLogout: () => void;
  onMobileMenuChange: (isOpen: boolean) => void;
  onModuleChange: (moduleId: string) => void;
};

const Badge = ({ count, compact = false }: { count: number; compact?: boolean }) => (
  <span className={`${compact ? 'min-w-[14px] h-3.5 text-[8px]' : 'min-w-[18px] h-4 text-[9px]'} flex items-center justify-center rounded-full bg-red-500 px-1 font-black text-white shadow-md`}>
    {count > 99 ? '99+' : count}
  </span>
);

const AlunoPortalShell = ({
  activeModule,
  alunoEmail,
  alunoNome,
  canViewCalendar,
  children,
  contentScrollRef,
  isMobileMenuOpen,
  unreadChatsCount,
  onLogout,
  onMobileMenuChange,
  onModuleChange,
}: AlunoPortalShellProps) => {
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const alunoInitials = (alunoNome.trim().slice(0, 2) || 'AL').toUpperCase();
  const menuItems: AlunoMenuItem[] = [
    { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={20} /> },
    { id: 'turmas', label: 'Meus Cursos', icon: <GraduationCap size={20} /> },
    { id: 'cursos', label: 'Cursos', icon: <BookOpen size={20} /> },
    ...(canViewCalendar
      ? [{ id: 'calendario', label: 'Agenda', icon: <CalendarDays size={20} /> }]
      : []),
    { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={20} /> },
    { id: 'biblioteca', label: 'Biblioteca', icon: <Library size={20} /> },
    { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={20} />, badge: unreadChatsCount },
    { id: 'secretaria', label: 'Secretaria', icon: <FileText size={20} /> },
    { id: 'perfil', label: 'Meu Perfil', icon: <User size={20} /> },
  ];

  const openModule = (moduleId: string, closeMobile = false) => {
    onModuleChange(moduleId);
    if (closeMobile) onMobileMenuChange(false);
  };

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      mobileDrawerRef.current?.querySelector<HTMLElement>('[data-mobile-drawer-close]')?.focus();
    }, 0);
    const handleDrawerKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onMobileMenuChange(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = mobileDrawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusableElements?.length) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDrawerKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleDrawerKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocusedElementRef.current?.focus();
    };
  }, [isMobileMenuOpen, onMobileMenuChange]);

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-slate-100 font-sans antialiased">
      <aside className="hidden w-64 flex-col bg-[#001a33] text-white shadow-xl z-20 lg:flex">
        <div className="border-b border-white/10 p-6">
          <div className="flex items-center justify-center rounded-2xl bg-white p-3 shadow-md">
            <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-11 w-full object-contain" />
          </div>
        </div>

        <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-6">
          {menuItems.map((item) => {
            const badge = item.badge || 0;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => openModule(item.id)}
                className={`group flex w-full items-center justify-between rounded-xl px-4 py-3.5 transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 font-bold text-white shadow-lg shadow-blue-900/50'
                    : 'font-medium text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`relative ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`}>
                    {item.icon}
                    {badge > 0 && !isActive ? (
                      <span className="absolute -right-1.5 -top-1.5 animate-pulse motion-reduce:animate-none">
                        <Badge count={badge} compact />
                      </span>
                    ) : null}
                  </div>
                  <span className="text-sm tracking-wide">{item.label}</span>
                </div>
                {badge > 0 && !isActive ? <Badge count={badge} /> : null}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <AlunoIdentity email={alunoEmail} initials={alunoInitials} name={alunoNome} />
          <LogoutButton onClick={onLogout} />
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-white/10 bg-[#001a33] px-4 pt-[env(safe-area-inset-top)] text-white shadow-lg md:hidden">
        <div className="flex h-9 w-[118px] items-center justify-center rounded-xl bg-white px-2 shadow-sm">
          <img src="/LogoUniverso.png" alt="Universo" className="h-7 w-full object-contain" />
        </div>
        <button
          type="button"
          onClick={() => openModule('perfil')}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-xs font-black text-white shadow-sm ring-1 ring-white/15"
          aria-label="Abrir meu perfil"
        >
          {alunoInitials}
        </button>
      </div>

      <div className="fixed inset-x-0 top-0 z-30 hidden h-16 items-center justify-between border-b border-white/10 bg-[#001a33] px-4 text-white shadow-lg md:flex lg:hidden">
        <div className="flex h-9 w-[118px] items-center justify-center rounded-xl bg-white px-2 shadow-sm">
          <img src="/LogoUniverso.png" alt="Universo" className="h-7 w-full object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white shadow-sm">
            {alunoInitials}
          </div>
          <button
            type="button"
            onClick={() => onMobileMenuChange(!isMobileMenuOpen)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
            aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-40 animate-fadeIn bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={() => onMobileMenuChange(false)}>
          <aside
            ref={mobileDrawerRef}
            id="aluno-mobile-drawer"
            className="flex h-full w-[86vw] max-w-[320px] flex-col bg-[#001a33] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Menu do portal do aluno"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-white px-3">
                <img src="/LogoUniverso.png" alt="Universo" className="h-9 w-full object-contain" />
              </div>
              <button data-mobile-drawer-close type="button" onClick={() => onMobileMenuChange(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-300" aria-label="Fechar menu">
                <X size={21} />
              </button>
            </div>

            <nav className="mt-4 flex-1 space-y-1 overflow-y-auto overscroll-contain pb-4">
              {menuItems.map((item) => {
                const badge = item.badge || 0;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => openModule(item.id, true)}
                    className={`flex min-h-12 w-full items-center justify-between rounded-xl px-4 py-3 transition-all ${
                      isActive
                        ? 'bg-blue-600 font-bold text-white shadow-lg shadow-blue-900/50'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {item.icon}
                        {badge > 0 && !isActive ? (
                          <span className="absolute -right-1.5 -top-1.5 animate-pulse motion-reduce:animate-none">
                            <Badge count={badge} compact />
                          </span>
                        ) : null}
                      </div>
                      <span className="text-sm tracking-wide">{item.label}</span>
                    </div>
                    {badge > 0 && !isActive ? <Badge count={badge} compact /> : null}
                  </button>
                );
              })}
            </nav>

            <div className="space-y-3 border-t border-white/10 pt-4">
              <AlunoIdentity email={alunoEmail} initials={alunoInitials} name={alunoNome} />
              <LogoutButton onClick={() => { onMobileMenuChange(false); onLogout(); }} />
            </div>
          </aside>
        </div>
      ) : null}

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden pt-[calc(4rem+env(safe-area-inset-top))] md:pt-16 lg:pt-0">
        <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-slate-200 bg-white px-8 py-4 shadow-sm lg:flex">
          <h2 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Portal do Aluno</h2>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-bold text-[#001a33]">{alunoNome}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Aluno</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-200 bg-blue-600 text-sm font-bold text-white shadow-sm">
              {alunoInitials}
            </div>
          </div>
        </header>

        <div ref={contentScrollRef} className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-slate-50 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 lg:p-8">
          {children}
        </div>
      </main>

      <AlunoMobileBottomNav
        activeModule={activeModule}
        canViewCalendar={canViewCalendar}
        isMoreOpen={isMobileMenuOpen}
        unreadChatsCount={unreadChatsCount}
        onMoreOpen={() => onMobileMenuChange(true)}
        onModuleChange={(moduleId) => openModule(moduleId, true)}
      />
    </div>
  );
};

const AlunoIdentity = ({ email, initials, name }: { email: string; initials: string; name: string }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold text-white shadow-md">{initials}</div>
    <div className="min-w-0">
      <p className="truncate text-xs font-black">{name}</p>
      <p className="truncate text-[10px] font-medium text-slate-400" title={email}>{email}</p>
    </div>
  </div>
);

const LogoutButton = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold uppercase tracking-wider text-slate-400 transition-all hover:bg-red-500/10 hover:text-red-400">
    <LogOut size={18} />
    <span>Sair</span>
  </button>
);

export default AlunoPortalShell;
