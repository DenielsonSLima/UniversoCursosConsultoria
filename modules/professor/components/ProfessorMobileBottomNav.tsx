import React from 'react';
import { CalendarDays, GraduationCap, LayoutDashboard, Menu, NotebookPen } from 'lucide-react';
import type { ProfessorMenuItem } from './ProfessorShell';

interface Props {
  activeModule: string;
  isMenuOpen: boolean;
  menuItems: readonly ProfessorMenuItem[];
  onModuleChange: (id: string) => void;
  onOpenMenu: () => void;
}
const items = [
  { id: 'inicio', label: 'Início', icon: LayoutDashboard },
  { id: 'turmas', label: 'Diários', icon: GraduationCap },
  { id: 'plano-curso', label: 'Planejar', icon: NotebookPen },
  { id: 'calendario', label: 'Agenda', icon: CalendarDays },
];

const ProfessorMobileBottomNav: React.FC<Props> = ({ activeModule, isMenuOpen, menuItems, onModuleChange, onOpenMenu }) => {
  const visible = items.filter((item) => menuItems.some((entry) => entry.id === item.id));
  const moreActive = isMenuOpen || !visible.some((item) => item.id === activeModule);
  return (
    <nav className="professor-bottom-nav" aria-label="Navegação principal do professor">
      {visible.map(({ id, label, icon: Icon }) => (
        <button
          key={id} type="button"
          aria-current={activeModule === id && !isMenuOpen ? 'page' : undefined}
          onClick={() => onModuleChange(id)}
        >
          <Icon size={21} /><span>{label}</span>
        </button>
      ))}
      <button
        type="button" aria-label="Abrir todos os módulos" aria-expanded={isMenuOpen}
        aria-controls={isMenuOpen ? 'professor-mobile-drawer' : undefined}
        aria-current={moreActive ? 'page' : undefined} onClick={onOpenMenu}
      >
        <Menu size={21} /><span>Mais</span>
      </button>
    </nav>
  );
};
export default ProfessorMobileBottomNav;
