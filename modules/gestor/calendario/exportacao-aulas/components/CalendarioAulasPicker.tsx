import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, LoaderCircle, Search } from 'lucide-react';
import { textMatchesSearch } from '../../../../../lib/search';

export interface CalendarioAulasPickerOption {
  id: string;
  label: string;
  description?: string;
}

interface Props {
  label: string;
  value: string;
  options: CalendarioAulasPickerOption[];
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

/** Mesmo padrão de foco, teclado e portal dos pickers personalizados do Portal. */
export default function CalendarioAulasPicker({
  label, value, options, onChange, placeholder, disabled, loading, error, onRetry,
}: Props) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const selected = options.find((option) => option.id === value);
  const filtered = useMemo(() => options.filter((option) => textMatchesSearch(
    query, [option.label, option.description, option.id],
  )), [options, query]);
  const available = !loading && !error && !disabled;
  const active = Math.min(activeIndex, Math.max(0, filtered.length - 1));
  const close = () => { setOpen(false); setQuery(''); };
  const openPicker = () => {
    if (disabled || open) return;
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const reposition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 32);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const opensBelow = below >= Math.min(240, above);
      const maxHeight = Math.max(0, Math.min(280, opensBelow ? below : above));
      setPosition({
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: opensBelow ? rect.bottom + 6 : Math.max(16, rect.top - maxHeight - 6),
        width,
        maxHeight,
      });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (disabled) { setOpen(false); setQuery(''); }
  }, [disabled]);

  useEffect(() => {
    if (!open || !available) return;
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, available, id, open]);

  const select = (option: CalendarioAulasPickerOption) => {
    if (!available) return;
    onChange(option.id);
    close();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { openPicker(); return; }
      setActiveIndex((current) => filtered.length
        ? (current + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length : 0);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (filtered[active]) select(filtered[active]);
    }
  };
  const status = loading ? 'Carregando opções...' : error ? 'Não foi possível carregar as opções.'
    : !options.length ? 'Nenhuma opção disponível neste contexto.'
      : !filtered.length ? 'Nenhum resultado para esta busca.' : '';

  return (
    <div ref={rootRef} className="min-w-0">
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          type="search"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-expanded={open}
          aria-busy={loading}
          aria-invalid={error || undefined}
          aria-activedescendant={open && available && filtered[active] ? `${id}-option-${active}` : undefined}
          value={open ? query : selected?.label || ''}
          disabled={disabled}
          placeholder={loading ? 'Carregando...' : error ? 'Opções indisponíveis' : placeholder}
          onFocus={openPicker}
          onClick={openPicker}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
          onKeyDown={onKeyDown}
          onBlur={close}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {loading ? <LoaderCircle size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
          : <ChevronDown size={13} className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 ${open ? 'rotate-180' : ''}`} />}
      </div>
      {open && createPortal(
        <div ref={panelRef} style={position} className="fixed z-[10020] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div id={`${id}-listbox`} role="listbox" aria-label={label} className="overflow-y-auto overscroll-contain p-1.5">
            {status ? (
              <div className="px-3 py-5 text-center text-xs text-slate-500">
                <p role={error ? 'alert' : 'status'}>{status}</p>
                {error && onRetry ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRetry} className="mt-2 rounded-lg border border-blue-200 px-3 py-2 font-semibold text-blue-700">Tentar novamente</button> : null}
              </div>
            ) : filtered.map((option, index) => (
              <button
                key={option.id}
                id={`${id}-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.id === value}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${option.id === value ? 'bg-blue-50' : index === active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-700">{option.label}</span>
                  {option.description ? <span className="mt-1 block text-[10px] text-slate-500">{option.description}</span> : null}
                </span>
                {option.id === value && <Check size={15} className="shrink-0 text-blue-700" />}
              </button>
            ))}
          </div>
        </div>, document.body,
      )}
    </div>
  );
}
