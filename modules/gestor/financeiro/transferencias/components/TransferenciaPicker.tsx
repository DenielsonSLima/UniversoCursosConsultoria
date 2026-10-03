import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { textMatchesSearch } from '../../../../../lib/search';

export interface TransferenciaPickerOption {
  id: string;
  label: string;
  detail: string;
}

interface TransferenciaPickerProps {
  label: string;
  options: TransferenciaPickerOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  loading?: boolean;
  error?: boolean;
  disabled?: boolean;
  accent: 'rose' | 'emerald';
}

export default function TransferenciaPicker({
  label, options, value, onChange, placeholder, loading, error, disabled, accent,
}: TransferenciaPickerProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const selected = options.find((option) => option.id === value);
  const filtered = useMemo(
    () => options.filter((option) => textMatchesSearch(query, [option.label, option.detail])),
    [options, query],
  );
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
      const width = Math.min(Math.max(rect.width, 380), window.innerWidth - 32);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const opensBelow = below >= Math.min(240, above);
      const height = Math.max(0, Math.min(280, opensBelow ? below : above));
      setPosition({
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: opensBelow ? rect.bottom + 6 : Math.max(16, rect.top - height - 6),
        width,
        maxHeight: height,
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
      if (rootRef.current?.contains(event.target as Node) || panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id, open]);

  const select = (option: TransferenciaPickerOption) => {
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
      if (available && filtered[active]) select(filtered[active]);
    }
  };
  const status = loading ? 'Carregando opções...' : error ? 'Não foi possível carregar. Tente atualizar.'
    : !options.length ? 'Nenhuma opção disponível para este polo.' : !filtered.length ? 'Nenhum resultado para esta busca.' : '';
  const focusClass = accent === 'rose' ? 'focus:border-rose-300 focus:ring-rose-100' : 'focus:border-emerald-300 focus:ring-emerald-100';
  const selectedClass = accent === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700';

  return (
    <div ref={rootRef} className="min-w-0 space-y-1">
      <label htmlFor={`${id}-input`} className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-4 text-slate-400" />
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
          aria-describedby={selected && !open && available ? `${id}-detail` : undefined}
          value={open ? query : available ? selected?.label || '' : ''}
          disabled={disabled}
          placeholder={loading ? 'Carregando...' : error ? 'Opções indisponíveis' : placeholder}
          onFocus={openPicker}
          onClick={openPicker}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
          onKeyDown={onKeyDown}
          onBlur={close}
          className={`h-12 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-semibold text-slate-700 outline-none focus:ring-2 disabled:opacity-50 ${focusClass}`}
        />
        {loading ? <Loader2 size={15} className="pointer-events-none absolute right-3 top-4 animate-spin text-slate-400" />
          : <ChevronDown size={15} className="pointer-events-none absolute right-3 top-4 text-slate-400" />}
      </div>
      {selected && !open && available && <p id={`${id}-detail`} className="text-[11px] font-medium leading-5 text-slate-500">{selected.detail}</p>}
      {error && <p role="alert" className="text-xs font-semibold text-rose-700">Não foi possível carregar as opções deste polo.</p>}
      {open && createPortal(
        <div ref={panelRef} style={position} className="fixed z-[10010] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
          <div className="border-b border-slate-100 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
          <div id={`${id}-listbox`} role="listbox" aria-label={label} className="overflow-y-auto overscroll-contain p-1.5">
            {status ? <p role="status" className="px-4 py-6 text-center text-xs font-semibold text-slate-500">{status}</p> : filtered.map((option, index) => (
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
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${option.id === value ? selectedClass : index === active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black text-slate-700" title={option.label}>{option.label}</span>
                  <span className="mt-1 block text-[11px] font-medium text-slate-500">{option.detail}</span>
                </span>
                {option.id === value && <Check size={16} className="shrink-0" />}
              </button>
            ))}
          </div>
        </div>, document.body,
      )}
    </div>
  );
}
