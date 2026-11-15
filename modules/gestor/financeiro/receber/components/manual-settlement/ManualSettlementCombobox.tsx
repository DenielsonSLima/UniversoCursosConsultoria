import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface ManualSettlementComboboxOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
  icon?: React.ReactNode;
  trailingLabel?: string;
  trailingTone?: 'positive' | 'negative' | 'muted';
}

interface ManualSettlementComboboxProps {
  label: string;
  value: string;
  options: ManualSettlementComboboxOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyMessage: string;
  disabled?: boolean;
}

const normalizeSearch = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .trim();

const ManualSettlementCombobox: React.FC<ManualSettlementComboboxProps> = ({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyMessage,
  disabled = false,
}) => {
  const inputId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ignoreNextFocusRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealRequest, setRevealRequest] = useState<{ index: number } | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return options;
    return options.filter((option) => normalizeSearch([
      option.label,
      option.description,
      option.keywords,
    ].filter(Boolean).join(' ')).includes(normalizedQuery));
  }, [options, query]);
  const selectedIndex = Math.max(0, filtered.findIndex((option) => option.value === value));

  const updatePosition = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportPadding = 16;
    const desiredHeight = Math.min(280, Math.max(120, filtered.length * 64 + 18));
    const roomBelow = window.innerHeight - rect.bottom - viewportPadding;
    const roomAbove = rect.top - viewportPadding;
    const showAbove = roomBelow < Math.min(desiredHeight, 190) && roomAbove > roomBelow;
    const maxHeight = Math.max(120, Math.min(desiredHeight, showAbove ? roomAbove - 8 : roomBelow - 8));

    setPosition({
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - rect.width - viewportPadding)),
      top: showAbove ? Math.max(viewportPadding, rect.top - maxHeight - 8) : rect.bottom + 8,
      width: rect.width,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();

    const handlePointerDown = (event: Event) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const handleViewportChange = () => updatePosition();

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [filtered.length, open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    setRevealRequest({ index: selectedIndex });
  }, [open, query, selectedIndex, value]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
    setQuery('');
  }, [disabled]);

  useEffect(() => {
    const list = listRef.current;
    const option = revealRequest && list?.querySelectorAll<HTMLElement>('[role="option"]')[revealRequest.index];
    if (!open || !list || !option) return;
    // Reveal only on opening/search/keyboard; hover and refreshed props keep manual scroll.
    const listRect = list.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    if (optionRect.top < listRect.top) list.scrollTop += optionRect.top - listRect.top;
    else if (optionRect.bottom > listRect.bottom) list.scrollTop += optionRect.bottom - listRect.bottom;
  }, [open, revealRequest]);

  const openPicker = () => {
    if (disabled) return;
    if (ignoreNextFocusRef.current) {
      ignoreNextFocusRef.current = false;
      return;
    }
    if (!open) setQuery('');
    setOpen(true);
  };

  const selectOption = (option: ManualSettlementComboboxOption) => {
    if (disabled) return;
    onChange(option.value);
    setQuery('');
    setOpen(false);
    if (document.activeElement !== inputRef.current) {
      ignoreNextFocusRef.current = true;
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setQuery('');
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      setQuery('');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openPicker();
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = filtered.length ? (activeIndex + delta + filtered.length) % filtered.length : 0;
      setActiveIndex(nextIndex);
      setRevealRequest({ index: nextIndex });
      return;
    }
    if (event.key === 'Enter' && open && filtered[activeIndex]) {
      event.preventDefault();
      selectOption(filtered[activeIndex]);
    }
  };

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        style={{
          left: position.left,
          top: position.top,
          width: position.width,
          maxHeight: position.maxHeight,
        }}
        className="fixed z-[10020] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Opções disponíveis</span>
          <span aria-live="polite" className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{filtered.length}</span>
        </div>
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="min-h-0 flex-1 overflow-y-auto p-1.5 overscroll-contain"
        >
          {filtered.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <button
                id={`${listboxId}-${option.value}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                disabled={disabled}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-emerald-100 bg-emerald-50'
                    : isActive
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                {option.icon ? (
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    isSelected ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {option.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="min-w-0 break-words text-xs font-black text-[#001a33]">{option.label}</span>
                    {option.trailingLabel ? (
                      <span className={`shrink-0 text-xs font-semibold tabular-nums ${
                        option.trailingTone === 'negative' ? 'text-rose-600'
                          : option.trailingTone === 'positive' ? 'text-emerald-700' : 'text-slate-500'
                      }`}>{option.trailingLabel}</span>
                    ) : null}
                  </span>
                  {option.description ? (
                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">{option.description}</span>
                  ) : null}
                </span>
                {isSelected ? <Check size={16} className="shrink-0 text-emerald-600" /> : null}
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-xs font-black text-slate-600">{emptyMessage}</p>
              <p className="mt-1 text-[10px] font-medium text-slate-400">Revise o termo informado.</p>
            </div>
          ) : null}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label} <span aria-hidden="true" className="text-emerald-600">*</span>
        <span className="sr-only"> (obrigatório)</span>
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
          {open ? <Search size={16} /> : selected?.icon ?? <Search size={16} />}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-required="true"
          aria-activedescendant={open && filtered[activeIndex]
            ? `${listboxId}-${filtered[activeIndex].value}`
            : undefined}
          autoComplete="off"
          disabled={disabled}
          value={open ? query : selected?.label || ''}
          placeholder={placeholder}
          onFocus={openPicker}
          onClick={openPicker}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm font-bold text-[#001a33] outline-none transition-all placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60"
        />
        <ChevronDown
          size={16}
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {panel}
    </div>
  );
};

export default ManualSettlementCombobox;
