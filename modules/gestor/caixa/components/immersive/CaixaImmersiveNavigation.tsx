import React from 'react';

export interface CaixaImmersiveNavigationItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface CaixaImmersiveNavigationProps {
  items: readonly CaixaImmersiveNavigationItem[];
  activeId?: string;
  ariaLabel?: string;
}

/**
 * Navegação estrutural por âncoras. O consumidor mantém a responsabilidade
 * pelos ids das seções e, quando necessário, pelo estado de seção ativa.
 */
export const CaixaImmersiveNavigation = ({
  items,
  activeId,
  ariaLabel = 'Seções do Caixa',
}: CaixaImmersiveNavigationProps) => {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-2 z-30 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_16px_38px_-28px_rgba(15,23,42,0.65)] backdrop-blur-xl"
    >
      <ul className="flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id} className="min-w-max snap-start">
              <a
                href={`#${item.id}`}
                aria-current={isActive ? 'location' : undefined}
                className={`group flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
                  isActive
                    ? 'bg-[#001a33] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-blue-50 hover:text-blue-800'
                }`}
              >
                {item.icon ? (
                  <span
                    aria-hidden="true"
                    className={isActive ? 'text-blue-200' : 'text-blue-600'}
                  >
                    {item.icon}
                  </span>
                ) : null}
                <span>
                  <span className="block text-xs font-extrabold tracking-tight">
                    {item.label}
                  </span>
                  {item.description ? (
                    <span
                      className={`mt-0.5 hidden text-[10px] font-medium sm:block ${
                        isActive ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

