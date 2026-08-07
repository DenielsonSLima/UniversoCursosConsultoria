import type { ComponentType } from 'react';
import {
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MessageSquare,
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
    { id: 'turmas', label: 'Meus cursos', icon: GraduationCap, modules: ['turmas', 'cursos'] },
    { id: 'comunicacao', label: 'Atendimento', icon: MessageSquare, modules: ['comunicacao'] },
    { id: 'financeiro', label: 'Financeiro', icon: CreditCard, modules: ['financeiro'] },
  ];

  const moreIsActive = isMoreOpen || !items.some((item) => item.modules.includes(activeModule));

  return (
    <nav
      aria-label="Navegação principal do aluno"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 px-2 shadow-[0_-10px_35px_rgba(0,26,51,0.10)] backdrop-blur-xl md:hidden"
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
              className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-colors ${
                isActive ? 'text-blue-700' : 'text-slate-400 active:text-[#001a33]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`absolute top-1.5 h-1 w-5 rounded-full transition-all ${isActive ? 'bg-blue-600' : 'bg-transparent'}`} />
              <span className={`flex h-9 w-11 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-blue-50' : 'bg-transparent'}`}>
                <span className="relative">
                  <Icon size={21} strokeWidth={isActive ? 2.5 : 2} />
                  {item.id === 'comunicacao' && unreadChatsCount > 0 ? (
                    <span className="absolute -right-2.5 -top-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-0.5 text-[9px] font-black leading-none text-white">
                      {unreadChatsCount > 9 ? '9+' : unreadChatsCount}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className={`truncate text-[10px] leading-none ${isActive ? 'font-black' : 'font-bold'}`}>
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onMoreOpen}
          className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-colors ${
            moreIsActive ? 'text-blue-700' : 'text-slate-400 active:text-[#001a33]'
          }`}
          aria-current={moreIsActive ? 'page' : undefined}
          aria-expanded={isMoreOpen}
          aria-controls={isMoreOpen ? 'aluno-mobile-drawer' : undefined}
        >
          <span className={`absolute top-1.5 h-1 w-5 rounded-full transition-all ${moreIsActive ? 'bg-blue-600' : 'bg-transparent'}`} />
          <span className={`relative flex h-9 w-11 items-center justify-center rounded-xl transition-colors ${moreIsActive ? 'bg-blue-50' : 'bg-transparent'}`}>
            <Menu size={21} strokeWidth={moreIsActive ? 2.5 : 2} />
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-0.5 text-[9px] font-black leading-none text-white">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            ) : null}
          </span>
          <span className={`text-[10px] leading-none ${moreIsActive ? 'font-black' : 'font-bold'}`}>Mais</span>
        </button>
      </div>
    </nav>
  );
};

export default AlunoMobileBottomNav;
