import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { textMatchesSearch } from '../../../../lib/search';
import type { TransferenciaDestinoOption } from './transferencia-destinos';

interface Props {
  options: TransferenciaDestinoOption[];
  value: string;
  label: string;
  placeholder: string;
  emptyMessage: string;
  loading: boolean;
  error: boolean;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (id: string) => void;
}

const TransferenciaDestinoPicker: React.FC<Props> = ({
  options, value, label, placeholder, emptyMessage, loading, error, disabled = false, inputRef, onChange,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef || ownInput;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.id === value);
  const filtered = useMemo(() => options.filter((option) => textMatchesSearch(
    search, option.termos,
  )), [options, search]);

  const close = () => { setOpen(false); setSearch(''); };
  const choose = (id: string) => {
    if (disabled || loading || error) return;
    onChange(id); close(); input.current?.focus();
  };
  const show = () => {
    if (disabled) return;
    setSearch(''); setActive(0); setOpen(true);
  };

  useEffect(() => {
    if (disabled) { setOpen(false); setSearch(''); }
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId, open]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const keyboard = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      close();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); setActive(event.key === 'ArrowUp' ? Math.max(0, filtered.length - 1) : 0); }
      else if (filtered.length) setActive((current) => (
        current + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length
      ) % filtered.length);
    } else if (event.key === 'Enter' && open && !loading && !error && filtered[active]) {
      event.preventDefault(); choose(filtered[active].id);
    }
  };
  const status = loading ? 'Carregando opções de destino...'
    : error ? 'Não foi possível carregar as opções.'
      : !options.length ? emptyMessage
        : !filtered.length ? 'Nenhuma opção corresponde à busca.' : '';

  return (
    <div ref={root} className="relative">
      <label htmlFor={`${listId}-input`} className="block text-xs font-black uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="relative mt-2">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input ref={input} id={`${listId}-input`} type="text" role="combobox" autoComplete="off"
          aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-required="true"
          aria-activedescendant={open && !loading && !error && filtered[active] ? `${listId}-${active}` : undefined}
          aria-describedby={status ? `${listId}-status` : undefined} disabled={disabled}
          value={open ? search : selected?.nome || ''}
          placeholder={placeholder}
          onFocus={show} onClick={() => { if (!open) show(); }}
          onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node)) close(); }}
          onChange={(event) => { setSearch(event.target.value); setActive(0); setOpen(true); }}
          onKeyDown={keyboard}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-11 pr-10 text-sm font-bold text-[#001a33] outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-60" />
        <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      {open && (
        <div className="absolute z-40 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <div id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto overscroll-contain">
            {!loading && !error && filtered.map((option, index) => (
              <button id={`${listId}-${index}`} key={option.id} type="button" role="option"
                aria-selected={option.id === value} tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${index === active ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-[#001a33]">{option.nome}</strong>
                  <span className="block text-xs text-slate-500">{option.descricao}</span>
                </span>
                {option.id === value && <Check size={16} className="text-violet-700" />}
              </button>
            ))}
            {status && <p id={`${listId}-status`} role="status" className="px-4 py-5 text-sm text-slate-600">{status}</p>}
          </div>
        </div>
      )}
      {!open && status && (loading || error || !options.length) && <p id={`${listId}-status`} role="status" className="mt-2 text-sm text-slate-600">{status}</p>}
    </div>
  );
};

export default TransferenciaDestinoPicker;
