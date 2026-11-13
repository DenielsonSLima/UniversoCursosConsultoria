import type { ComponentType } from 'react';
import {
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Menu,
  FileText,
} from 'lucide-react';

type AlunoMobileBottomNavProps = {
  activeModule: string;
  isMoreOpen: boolean;
  unreadChatsCount: number;
  unreadNotificationsCount: number;
  onMoreOpen: () => void;
  onModuleChange: (moduleId: string) => void;
};

type MobileNavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  modules: string[];
};

const AlunoMobileBottomNav = ({
  activeModule,
  isMoreOpen,
  unreadChatsCount,
  unreadNotificationsCount,
  onMoreOpen,
  onModuleChange,
}: AlunoMobileBottomNavProps) => {
  const items: MobileNavItem[] = [
    { id: 'inicio', label: 'Início', icon: LayoutDashboard, modules: ['inicio'] },
    { id: 'turmas', label: 'Meus cursos', icon: GraduationCap, modules: ['turmas'] },
    { id: 'financeiro', label: 'Financeiro', icon: CreditCard, modules: ['financeiro'] },
    { id: 'secretaria', label: 'Documentos', icon: FileText, modules: ['secretaria'] },
  ];

  const moreIsActive = isMoreOpen || !items.some((item) => item.modules.includes(activeModule));

  return (
    <nav
      aria-label="Navegação principal do aluno"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 px-2 shadow-sm backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5 items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.modules.includes(activeModule) && !isMoreOpen;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onModuleChange(item.id)}
              className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 transition-colors ${
                isActive ? 'text-blue-700' : 'text-slate-600 active:text-[#001a33]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`absolute top-1.5 h-1 w-5 rounded-full transition-all ${isActive ? 'bg-blue-600' : 'bg-transparent'}`} />
              <span className={`flex h-9 w-11 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-blue-50' : 'bg-transparent'}`}>
                <span className="relative">
                  <Icon size={21} strokeWidth={isActive ? 2.5 : 2} />
                </span>
              </span>
              <span className={`flex h-6 items-center justify-center text-center text-[11px] leading-3 max-[360px]:text-[10px] ${isActive ? 'font-medium' : 'font-normal'}`}>
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onMoreOpen}
          className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 transition-colors ${
            moreIsActive ? 'text-blue-700' : 'text-slate-600 active:text-[#001a33]'
          }`}
          aria-current={moreIsActive ? 'page' : undefined}
          aria-expanded={isMoreOpen}
          aria-controls={isMoreOpen ? 'aluno-mobile-drawer' : undefined}
        >
          <span className={`absolute top-1.5 h-1 w-5 rounded-full transition-all ${moreIsActive ? 'bg-blue-600' : 'bg-transparent'}`} />
          <span className={`relative flex h-9 w-11 items-center justify-center rounded-xl transition-colors ${moreIsActive ? 'bg-blue-50' : 'bg-transparent'}`}>
            <Menu size={21} strokeWidth={moreIsActive ? 2.5 : 2} />
            {(unreadNotificationsCount + unreadChatsCount) > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-0.5 text-[9px] font-medium leading-none text-white">
                {(unreadNotificationsCount + unreadChatsCount) > 9 ? '9+' : (unreadNotificationsCount + unreadChatsCount)}
              </span>
            ) : null}
          </span>
          <span className={`flex h-6 items-center justify-center text-[11px] leading-3 max-[360px]:text-[10px] ${moreIsActive ? 'font-medium' : 'font-normal'}`}>Mais</span>
        </button>
      </div>
    </nav>
  );
};

export default AlunoMobileBottomNav;
