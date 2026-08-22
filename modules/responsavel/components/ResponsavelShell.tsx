import React from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import type { ResponsavelModuleId } from '../responsavel.contract';

export interface ResponsavelMenuItem {
  id: ResponsavelModuleId;
  label: string;
  icon: React.ReactNode;
}

interface ResponsavelShellProps {
  activeModule: ResponsavelModuleId;
  children: React.ReactNode;
  contentScrollRef: React.RefObject<HTMLDivElement>;
  email: string;
  isMobileMenuOpen: boolean;
  menuItems: readonly ResponsavelMenuItem[];
  nome: string;
  onLogout: () => void;
  onMobileMenuChange: (isOpen: boolean) => void;
  onModuleChange: (moduleId: ResponsavelModuleId) => void;
}

const ResponsavelNavigation: React.FC<{
  activeModule: ResponsavelModuleId;
  menuItems: readonly ResponsavelMenuItem[];
  onModuleChange: (moduleId: ResponsavelModuleId) => void;
}> = ({ activeModule, menuItems, onModuleChange }) => (
  <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-6">
    {menuItems.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => onModuleChange(item.id)}
        className={`group flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200 ${
          activeModule === item.id
            ? 'border border-purple-400/35 bg-[#092744] font-semibold text-white shadow-lg shadow-purple-950/30 ring-1 ring-purple-500/20'
            : 'font-normal text-slate-400 hover:bg-white/5 hover:text-white'
        }`}
      >
        <span className={activeModule === item.id ? 'text-purple-300' : 'text-slate-400 group-hover:text-purple-400'}>{item.icon}</span>
        <span className="whitespace-nowrap text-sm">{item.label}</span>
      </button>
    ))}
  </nav>
);

const ResponsavelAccountCard: React.FC<{
  email: string;
  nome: string;
  onLogout: () => void;
}> = ({ email, nome, onLogout }) => (
  <div className="border-t border-white/10 p-4">
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-sm font-black text-white shadow-md">{nome.slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold leading-tight text-white" title={nome}>{nome}</p>
          <p className="mt-1 truncate text-[10px] text-slate-400" title={`Responsável: ${email}`}>{email}</p>
        </div>
      </div>
      <button type="button" onClick={onLogout} title="Sair" aria-label="Sair do portal do responsável" className="shrink-0 rounded-xl p-2 text-slate-400 transition-all hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-purple-400/60"><LogOut size={16} /></button>
    </div>
  </div>
);

const ResponsavelShell: React.FC<ResponsavelShellProps> = ({
  activeModule,
  children,
  contentScrollRef,
  email,
  isMobileMenuOpen,
  menuItems,
  nome,
  onLogout,
  onMobileMenuChange,
  onModuleChange,
}) => (
  <div className="professor-typography flex h-screen overflow-hidden bg-slate-100 font-sans">
    <aside className="portal-sidebar-typography z-20 hidden w-64 flex-col bg-[#001a33] text-white shadow-xl lg:flex">
      <div className="border-b border-white/10 p-6">
        <div className="flex items-center justify-center rounded-2xl bg-white p-3 shadow-md">
          <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-11 w-full object-contain" />
        </div>
      </div>
      <ResponsavelNavigation activeModule={activeModule} menuItems={menuItems} onModuleChange={onModuleChange} />
      <ResponsavelAccountCard email={email} nome={nome} onLogout={onLogout} />
    </aside>

    <div className="fixed top-0 z-30 flex w-full items-center justify-between bg-[#001a33] px-4 py-3 text-white shadow-lg lg:hidden">
      <div className="flex h-8 items-center justify-center rounded-xl bg-white px-3 py-1"><img src="/LogoUniverso.png" alt="Universo" className="h-6 object-contain" /></div>
      <button type="button" onClick={() => onMobileMenuChange(!isMobileMenuOpen)} aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}>{isMobileMenuOpen ? <X /> : <Menu />}</button>
    </div>

    {isMobileMenuOpen ? (
      <div className="fixed inset-0 z-40 bg-black/50 animate-fadeIn lg:hidden" onClick={() => onMobileMenuChange(false)}>
        <aside className="portal-sidebar-typography flex h-full w-64 flex-col bg-[#001a33] p-4 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 mt-12 flex items-center justify-center rounded-2xl bg-white p-3"><img src="/LogoUniverso.png" alt="Universo" className="h-8 object-contain" /></div>
          <ResponsavelNavigation
            activeModule={activeModule}
            menuItems={menuItems}
            onModuleChange={(moduleId) => {
              onModuleChange(moduleId);
              onMobileMenuChange(false);
            }}
          />
          <ResponsavelAccountCard email={email} nome={nome} onLogout={onLogout} />
        </aside>
      </div>
    ) : null}

    <main className="relative flex w-full flex-1 flex-col overflow-auto pt-16 lg:pt-0">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 shadow-sm sm:px-8">
        <h2 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Portal do Responsável</h2>
        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-bold text-[#001a33]">{nome}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Responsável</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-200 bg-purple-600 text-sm font-bold text-white shadow-sm">{nome.slice(0, 2).toUpperCase()}</div>
        </div>
      </header>
      <div ref={contentScrollRef} className="flex-1 overflow-auto bg-slate-50 p-5 sm:p-8">{children}</div>
    </main>
  </div>
);

export default ResponsavelShell;
