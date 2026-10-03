import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { textMatchesSearch } from '../../../../../lib/search';

export interface RenegociacaoFilterOption {
  id: string;
  label: string;
  description?: string;
}

interface RenegociacaoFilterPickerProps {
  label: string;
  value: string;
  options: readonly RenegociacaoFilterOption[];
  onChange: (value: string) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

const RenegociacaoFilterPicker: React.FC<RenegociacaoFilterPickerProps> = ({
  label, value, options, onChange, loading = false, error = false, onRetry,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.id === value);
  const [rememberedSelection, setRememberedSelection] = useState<RenegociacaoFilterOption | undefined>(selected);
  const filtered = useMemo(
    () => options.filter((option) => textMatchesSearch(query, [option.label, option.description, option.id])),
    [options, query],
  );
  const selectable = !loading && !error;

  useEffect(() => {
    if (selected) setRememberedSelection(selected);
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => { setActiveIndex(0); }, [query, open, options]);
  useEffect(() => {
    if (open && selectable) {
      listboxRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open, selectable]);

  const close = () => { setOpen(false); setQuery(''); };
  const openPicker = () => { if (!open) { setQuery(''); setOpen(true); } };
  const select = (option: RenegociacaoFilterOption) => {
    setRememberedSelection(option);
    onChange(option.id);
    close();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openPicker();
      } else if (selectable && filtered.length) {
        setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length);
      }
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (selectable && filtered[activeIndex]) select(filtered[activeIndex]);
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
      }}
    >
      <label htmlFor={`${listboxId}-input`} className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && selectable && filtered[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
          autoComplete="off"
          value={open ? query : selected?.label || (rememberedSelection?.id === value ? rememberedSelection.label : value ? 'Seleção atual' : '')}
          placeholder={`Buscar ${label.toLocaleLowerCase('pt-BR')}...`}
          onFocus={openPicker}
          onClick={openPicker}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          className={`min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 text-sm font-medium text-[#001a33] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${value ? 'pr-16' : 'pr-9'}`}
        />
        {value ? (
          <button
            type="button"
            aria-label={`Limpar filtro de ${label.toLocaleLowerCase('pt-BR')}`}
            onClick={() => { inputRef.current?.focus(); onChange(''); close(); }}
            className="absolute right-7 top-1/2 flex min-h-8 min-w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={14} />
          </button>
        ) : null}
        <ChevronDown size={16} className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 ${open ? 'rotate-180' : ''}`} />
      </div>
      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {loading ? (
            <p role="status" className="flex items-center gap-2 px-3 py-5 text-xs font-bold text-slate-500">
              <Loader2 size={15} className="animate-spin" /> Carregando opções...
            </p>
          ) : error ? (
            <div role="alert" className="space-y-2 px-3 py-4 text-xs font-medium text-rose-700">
              <p>Não foi possível carregar as opções.</p>
              {onRetry ? <button type="button" onClick={onRetry} className="min-h-9 rounded-lg border border-rose-200 px-3 font-bold">Tentar novamente</button> : null}
            </div>
          ) : null}
          <div ref={listboxRef} id={listboxId} role="listbox" aria-label={label} className="max-h-56 overflow-y-auto overscroll-contain p-1.5">
            {selectable ? filtered.map((option, index) => (
              <button
                key={option.id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={option.id === value}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${option.id === value ? 'bg-blue-50' : activeIndex === index ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-700">{option.label}</span>
                  {option.description ? <span className="block text-[10px] font-medium text-slate-500">{option.description}</span> : null}
                </span>
                {option.id === value ? <Check size={15} className="shrink-0 text-blue-700" /> : null}
              </button>
            )) : null}
            {selectable && !filtered.length ? (
              <p role="status" className="px-3 py-5 text-center text-xs font-medium text-slate-500">
                {query.trim() ? 'Nenhuma opção encontrada para esta busca.' : 'Nenhuma opção disponível neste contexto.'}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default RenegociacaoFilterPicker;
