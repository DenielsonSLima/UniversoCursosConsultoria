import type { KeyboardEvent, ReactNode } from 'react';

type FinancialTabKeyboardEvent = KeyboardEvent<HTMLButtonElement>; // eslint-disable-line no-undef

export interface FinancialUnderlineTabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  activeIconClassName?: string;
  badgeClassName?: string;
}

interface FinancialUnderlineTabsProps<T extends string> {
  items: readonly FinancialUnderlineTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  indicatorClassName?: string;
  activeIconClassName?: string;
  equalWidth?: boolean;
}

const FinancialUnderlineTabs = <T extends string,>({
  items,
  value,
  onChange,
  ariaLabel,
  indicatorClassName = 'bg-[#4169E1]',
  activeIconClassName = 'text-[#4169E1]',
  equalWidth = false,
}: FinancialUnderlineTabsProps<T>) => {
  const handleKeyDown = (event: FinancialTabKeyboardEvent, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    const lastIndex = items.length - 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : event.key === 'ArrowRight'
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;

    onChange(items[nextIndex].id);
    const tabButtons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    const nextButton = tabButtons?.item(nextIndex) as unknown as { focus: () => void } | null;
    nextButton?.focus();
  };

  return (
    <div className="max-w-full overflow-x-auto border-b border-slate-200">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={`flex gap-6 pb-px ${equalWidth ? 'min-w-full' : 'min-w-max'}`}
      >
        {items.map((item, index) => {
          const isActive = value === item.id;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`group relative flex min-h-11 items-center justify-center gap-2 pb-3 pt-2 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                equalWidth ? 'min-w-48 flex-1' : 'shrink-0'
              } ${
                isActive
                  ? 'font-extrabold text-[#001a33]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.icon ? (
                <span
                  className={`transition-colors ${
                    isActive
                      ? item.activeIconClassName || activeIconClassName
                      : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                >
                  {item.icon}
                </span>
              ) : null}
              <span>{item.label}</span>
              {item.badge !== undefined ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    isActive
                      ? item.badgeClassName || 'bg-slate-100 text-slate-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
              {isActive ? (
                <span
                  aria-hidden="true"
                  className={`absolute -bottom-px left-0 right-0 h-0.5 rounded-full ${indicatorClassName}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FinancialUnderlineTabs;
