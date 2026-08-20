import React from 'react';
import {
  Building,
  CalendarDays,
  ChevronDown,
  CreditCard,
  FileSignature,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  NotebookPen,
  User,
  X,
} from 'lucide-react';

export interface ProfessorPolo {
  id: string;
  nome: string;
  cidade?: string | null;
  estado?: string | null;
  cnpj?: string | null;
  is_matriz?: boolean;
  logo_url?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  telefone?: string | null;
  watermark_url?: string | null;
  watermark_opacity?: number | null;
  watermark_scale?: number | null;
  watermark_rotate?: boolean | null;
}

export interface ProfessorMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface ProfessorShellProps {
  activeModule: string;
  activePolos: ProfessorPolo[];
  children: React.ReactNode;
  contentScrollRef: React.RefObject<HTMLDivElement>;
  currentPolo: ProfessorPolo | null;
  currentPoloId: string | null;
  isMobileMenuOpen: boolean;
  isPoloSelectorOpen: boolean;
  professorEmail: string;
  professorNome: string;
  /** A casca é visual; cada portal continua responsável por sua própria guarda. */
  menuItems?: readonly ProfessorMenuItem[];
  portalTitle?: string;
  portalRoleLabel?: string;
  logoutAriaLabel?: string;
  onLogout: () => void;
  onModuleChange: (moduleId: string) => void;
  onMobileMenuChange: (isOpen: boolean) => void;
  onPoloChange: (poloId: string) => void;
  onPoloSelectorChange: (isOpen: boolean) => void;
}

const MENU_ITEMS: ProfessorMenuItem[] = [
  { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={20} /> },
  { id: 'turmas', label: 'Disciplinas', icon: <GraduationCap size={20} /> },
  { id: 'plano-curso', label: 'Plano de Curso', icon: <NotebookPen size={20} /> },
  { id: 'assinatura-eletronica', label: 'Assinaturas', icon: <FileSignature size={20} /> },
  { id: 'calendario', label: 'Agenda', icon: <CalendarDays size={20} /> },
  { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={20} /> },
  { id: 'biblioteca', label: 'Biblioteca', icon: <Library size={20} /> },
  { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={20} /> },
  { id: 'perfil', label: 'Meu Perfil', icon: <User size={20} /> },
];

const formatPoloLocation = (polo: ProfessorPolo) =>
  [polo.cidade, polo.estado].filter(Boolean).join(' - ');

const formatPoloDetails = (polo: ProfessorPolo) =>
  [polo.cnpj ? `CNPJ: ${polo.cnpj}` : null, formatPoloLocation(polo)]
    .filter(Boolean)
    .join(' • ');

const ProfessorNavigation: React.FC<{
  activeModule: string;
  menuItems: readonly ProfessorMenuItem[];
  onModuleChange: (moduleId: string) => void;
}> = ({ activeModule, menuItems, onModuleChange }) => (
  <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
    {menuItems.map((item) => (
      <button
        key={item.id}
        onClick={() => onModuleChange(item.id)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group ${
          activeModule === item.id
            ? 'bg-[#092744] text-white shadow-lg shadow-purple-950/30 font-semibold border border-purple-400/35 ring-1 ring-purple-500/20'
            : 'text-slate-400 hover:bg-white/5 hover:text-white font-normal'
        }`}
      >
        <div className={`${activeModule === item.id ? 'text-purple-300' : 'text-slate-400 group-hover:text-purple-400'}`}>
          {item.icon}
        </div>
        <span className="whitespace-nowrap text-sm">{item.label}</span>
      </button>
    ))}
  </nav>
);

const ProfessorAccountCard: React.FC<{
  professorEmail: string;
  professorNome: string;
  roleLabel?: string;
  logoutAriaLabel?: string;
  onLogout: () => void;
}> = ({ professorEmail, professorNome, roleLabel = 'Docente', logoutAriaLabel = 'Sair do portal do professor', onLogout }) => (
  <div className="border-t border-white/10 p-4">
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 transition-colors duration-300 hover:bg-white/10">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-sm font-black text-white shadow-md">
          {professorNome.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold leading-tight text-white" title={professorNome}>
            {professorNome}
          </p>
          <p className="mt-1 truncate text-[10px] text-slate-400" title={`${roleLabel}: ${professorEmail}`}>
            {professorEmail}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        title="Sair"
        aria-label={logoutAriaLabel}
        className="shrink-0 rounded-xl p-2 text-slate-400 transition-all duration-200 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
      >
        <LogOut size={16} />
      </button>
    </div>
  </div>
);

const PoloSelector: React.FC<{
  activePolos: ProfessorPolo[];
  currentPolo: ProfessorPolo;
  currentPoloId: string | null;
  isOpen: boolean;
  onChange: (poloId: string) => void;
  onOpenChange: (isOpen: boolean) => void;
}> = ({ activePolos, currentPolo, currentPoloId, isOpen, onChange, onOpenChange }) => (
  <div
    className="relative hidden h-14 w-[23rem] md:block"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        onOpenChange(false);
      }
    }}
  >
    <button
      type="button"
      onClick={() => onOpenChange(!isOpen)}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
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
          isOpen ? 'rotate-180' : ''
        }`}
      />
    </button>

    {isOpen ? (
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
              onClick={() => onChange(polo.id)}
              className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                isSelected ? 'bg-purple-50 text-purple-950' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-start gap-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isSelected ? 'bg-purple-650' : 'bg-slate-300'}`} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-extrabold uppercase tracking-wide">{polo.nome}</span>
                  <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    {formatPoloDetails(polo) || 'Dados do polo não informados'}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    ) : null}
  </div>
);

const ProfessorShell: React.FC<ProfessorShellProps> = ({
  activeModule,
  activePolos,
  children,
  contentScrollRef,
  currentPolo,
  currentPoloId,
  isMobileMenuOpen,
  isPoloSelectorOpen,
  professorEmail,
  professorNome,
  menuItems = MENU_ITEMS,
  portalTitle = 'Portal do Professor',
  portalRoleLabel = 'Docente',
  logoutAriaLabel = 'Sair do portal do professor',
  onLogout,
  onModuleChange,
  onMobileMenuChange,
  onPoloChange,
  onPoloSelectorChange,
}) => (
  <div className="professor-typography flex h-screen overflow-hidden bg-slate-100 font-sans">
    <aside className="portal-sidebar-typography hidden lg:flex flex-col w-64 bg-[#001a33] text-white shadow-xl z-20">
      <div className="p-6 border-b border-white/10">
        <div className="bg-white p-3 rounded-2xl shadow-md flex items-center justify-center">
          <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-11 w-full object-contain" />
        </div>
      </div>

      <ProfessorNavigation activeModule={activeModule} menuItems={menuItems} onModuleChange={onModuleChange} />
      <ProfessorAccountCard
        professorEmail={professorEmail}
        professorNome={professorNome}
        roleLabel={portalRoleLabel}
        logoutAriaLabel={logoutAriaLabel}
        onLogout={onLogout}
      />
    </aside>

    <div className="lg:hidden fixed top-0 w-full bg-[#001a33] text-white z-30 px-4 py-3 flex justify-between items-center shadow-lg">
      <div className="bg-white px-3 py-1 rounded-xl flex items-center justify-center h-8">
        <img src="/LogoUniverso.png" alt="Universo" className="h-6 object-contain" />
      </div>
      <button onClick={() => onMobileMenuChange(!isMobileMenuOpen)}>
        {isMobileMenuOpen ? <X /> : <Menu />}
      </button>
    </div>

    {isMobileMenuOpen ? (
      <div className="lg:hidden fixed inset-0 bg-black/50 z-40 animate-fadeIn" onClick={() => onMobileMenuChange(false)}>
        <aside
          className="portal-sidebar-typography w-64 h-full bg-[#001a33] text-white shadow-2xl p-4 flex flex-col"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="bg-white p-3 rounded-2xl flex items-center justify-center mb-4 mt-12">
            <img src="/LogoUniverso.png" alt="Universo" className="h-8 object-contain" />
          </div>

          <nav className="flex-1 overflow-y-auto space-y-2 mt-4">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onModuleChange(item.id);
                  onMobileMenuChange(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeModule === item.id
                    ? 'bg-[#092744] text-white font-semibold shadow-lg shadow-purple-950/30 border border-purple-400/35'
                    : 'font-normal text-slate-400'
                }`}
              >
                {item.icon}
                <span className="whitespace-nowrap text-sm">{item.label}</span>
              </button>
            ))}
          </nav>

          <ProfessorAccountCard
            professorEmail={professorEmail}
            professorNome={professorNome}
            roleLabel={portalRoleLabel}
            logoutAriaLabel={logoutAriaLabel}
            onLogout={onLogout}
          />
        </aside>
      </div>
    ) : null}

    <main className="flex-1 overflow-auto relative w-full lg:pt-0 pt-16 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-black text-[#001a33] uppercase tracking-tight">{portalTitle}</h2>
        </div>

        <div className="flex items-center gap-6">
          {currentPolo ? (
            <PoloSelector
              activePolos={activePolos}
              currentPolo={currentPolo}
              currentPoloId={currentPoloId}
              isOpen={isPoloSelectorOpen}
              onChange={onPoloChange}
              onOpenChange={onPoloSelectorChange}
            />
          ) : null}

          <div className="w-px h-8 bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-[#001a33]">{professorNome}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">{portalRoleLabel}</p>
            </div>
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-slate-200 shadow-sm">
              {professorNome.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div ref={contentScrollRef} className="p-8 flex-1 overflow-auto bg-slate-50">
        {children}
      </div>
    </main>
  </div>
);

export default ProfessorShell;
