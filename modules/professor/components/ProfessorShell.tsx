import React, { useEffect, useRef } from 'react';
import { CalendarDays, CreditCard, FileSignature, GraduationCap, LayoutDashboard, Library, LogOut, Menu, MessageSquare, NotebookPen, User, X } from 'lucide-react';
import InstitutionalSelect from '../../shared/components/InstitutionalSelect';
import ProfessorMobileBottomNav from './ProfessorMobileBottomNav';
import './professor-shell.css';

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
export interface ProfessorMenuItem { id: string; label: string; icon: React.ReactNode; }
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
  { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={19} /> },
  { id: 'turmas', label: 'Disciplinas e diários', icon: <GraduationCap size={19} /> },
  { id: 'plano-curso', label: 'Planejamento de aulas', icon: <NotebookPen size={19} /> },
  { id: 'assinatura-eletronica', label: 'Assinaturas', icon: <FileSignature size={19} /> },
  { id: 'calendario', label: 'Agenda', icon: <CalendarDays size={19} /> },
  { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={19} /> },
  { id: 'biblioteca', label: 'Biblioteca', icon: <Library size={19} /> },
  { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={19} /> },
  { id: 'perfil', label: 'Meu perfil', icon: <User size={19} /> },
];
const Logo = () => <div className="professor-shell-logo"><img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" /></div>;
const Navigation: React.FC<{ items: readonly ProfessorMenuItem[]; active: string; onChange: (id: string) => void }> = ({ items, active, onChange }) => (
  <nav className="professor-shell-navigation" aria-label="Módulos do portal">
    {items.map((item) => (
      <button
        type="button" key={item.id}
        aria-current={active === item.id ? 'page' : undefined}
        onClick={() => onChange(item.id)}
      >
        {item.icon}<span>{item.label}</span>
      </button>
    ))}
  </nav>
);
const Account: React.FC<{ name: string; email: string; logoutLabel: string; onLogout: () => void }> = ({ name, email, logoutLabel, onLogout }) => (
  <div className="professor-shell-account"><div className="professor-shell-initials">{name.trim().slice(0, 2).toUpperCase() || 'PR'}</div>
    <div className="min-w-0 flex-1"><p title={name}>{name}</p><small title={email}>{email}</small></div>
    <button type="button" aria-label={logoutLabel} onClick={onLogout}><LogOut size={18} /></button>
  </div>
);

const ProfessorShell: React.FC<ProfessorShellProps> = ({
  activeModule, activePolos, children, contentScrollRef, currentPolo, currentPoloId,
  isMobileMenuOpen, professorEmail, professorNome, menuItems = MENU_ITEMS,
  portalTitle = 'Portal do professor', portalRoleLabel = 'Docente',
  logoutAriaLabel = 'Sair do portal do professor', onLogout, onModuleChange,
  onMobileMenuChange, onPoloChange, onPoloSelectorChange,
}) => {
  const drawerRef = useRef<HTMLElement>(null);
  const openModule = (id: string) => { onModuleChange(id); onMobileMenuChange(false); };
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => drawerRef.current?.querySelector<HTMLElement>('[data-drawer-close]')?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onMobileMenuChange(false); return; }
      if (event.key !== 'Tab') return;
      const elements = drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      window.clearTimeout(timer); document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [isMobileMenuOpen, onMobileMenuChange]);

  return <div className="professor-typography professor-shell">
    <aside className="professor-shell-sidebar"><Logo /><Navigation items={menuItems} active={activeModule} onChange={openModule} />
      <Account name={professorNome} email={professorEmail} logoutLabel={logoutAriaLabel} onLogout={onLogout} />
    </aside>
    {isMobileMenuOpen && <div className="professor-shell-backdrop" onClick={() => onMobileMenuChange(false)}>
      <aside
        ref={drawerRef} id="professor-mobile-drawer" role="dialog"
        aria-modal="true" aria-label="Menu do portal" className="professor-shell-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="professor-shell-drawer-header">
          <Logo />
          <button data-drawer-close type="button" aria-label="Fechar menu" onClick={() => onMobileMenuChange(false)}>
            <X size={21} />
          </button>
        </div>
        <Navigation items={menuItems} active={activeModule} onChange={openModule} />
        <Account name={professorNome} email={professorEmail} logoutLabel={logoutAriaLabel} onLogout={() => { onMobileMenuChange(false); onLogout(); }} />
      </aside>
    </div>}
    <main className="professor-shell-main">
      <header className="professor-shell-header">
        <div className="professor-shell-heading">
          <div className="professor-shell-mobile-logo"><Logo /></div>
          <div>
            <p>{portalTitle}</p>
            <h1>{menuItems.find((item) => item.id === activeModule)?.label || portalRoleLabel}</h1>
          </div>
        </div>
        <button
          className="professor-shell-menu-button" type="button"
          aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={isMobileMenuOpen}
          onClick={() => onMobileMenuChange(!isMobileMenuOpen)}
        ><Menu size={22} /></button>
        {currentPolo && (
          <div className="professor-shell-polo">
            <InstitutionalSelect
              value={currentPoloId || ''} ariaLabel="Unidade de trabalho"
              disabled={activePolos.length <= 1} showOptionDescriptions
              options={activePolos.map((polo) => ({
                value: polo.id,
                label: polo.nome,
                description: [polo.cidade, polo.estado, polo.cnpj].filter(Boolean).join(' · '),
                keywords: [polo.cidade, polo.estado, polo.cnpj].filter(Boolean).join(' '),
              }))}
              onValueChange={(id) => { onPoloSelectorChange(false); onPoloChange(id); }}
            />
            <small>{[currentPolo.cidade, currentPolo.estado].filter(Boolean).join(' / ')}</small>
          </div>
        )}
        <div className="professor-shell-identity"><span>{professorNome}</span><small>{portalRoleLabel}</small></div>
      </header>
      <div ref={contentScrollRef} className="professor-shell-content">{children}</div>
    </main>
    <ProfessorMobileBottomNav
      activeModule={activeModule} isMenuOpen={isMobileMenuOpen} menuItems={menuItems}
      onModuleChange={openModule} onOpenMenu={() => onMobileMenuChange(true)}
    />
  </div>;
};
export default ProfessorShell;
