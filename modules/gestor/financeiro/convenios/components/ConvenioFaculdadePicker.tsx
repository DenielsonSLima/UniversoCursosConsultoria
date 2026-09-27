import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { textMatchesSearch } from '../../../../../lib/search';
import type { ConvenioParceiroOption } from '../convenios.types';

interface ConvenioFaculdadePickerProps {
  options: ConvenioParceiroOption[];
  value: string;
  loading: boolean;
  error: boolean;
  onChange: (id: string) => void;
}

const formatCnpj = (value: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return value || 'CNPJ não informado';
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};

const ConvenioFaculdadePicker: React.FC<ConvenioFaculdadePickerProps> = ({
  options,
  value,
  loading,
  error,
  onChange,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.id === value);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((option) => textMatchesSearch(query, [option.nome, option.cpfCnpj]));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: Event) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const openPicker = () => {
    if (loading || error) return;
    setQuery('');
    setOpen(true);
  };

  const selectOption = (option: ConvenioParceiroOption) => {
    onChange(option.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
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
      if (!open) openPicker();
      setActiveIndex((current) => {
        if (filtered.length === 0) return 0;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        return (current + delta + filtered.length) % filtered.length;
      });
      return;
    }
    if (event.key === 'Enter' && open && filtered[activeIndex]) {
      event.preventDefault();
      selectOption(filtered[activeIndex]);
    }
  };

  const placeholder = loading
    ? 'Carregando faculdades parceiras...'
    : error
      ? 'Não foi possível carregar as faculdades'
      : 'Digite ou selecione uma faculdade parceira';

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={`${listboxId}-input`} className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
        Faculdade parceira *
      </label>
      <div className="relative mt-1">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-required="true"
          aria-activedescendant={open && filtered[activeIndex] ? `${listboxId}-${filtered[activeIndex].id}` : undefined}
          autoComplete="off"
          value={open ? query : selected?.nome || ''}
          placeholder={placeholder}
          disabled={loading || error}
          onFocus={openPicker}
          onClick={openPicker}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-11 text-sm font-bold text-[#001a33] outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {loading ? (
          <Loader2 size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-cyan-700" />
        ) : (
          <ChevronDown
            size={16}
            className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Faculdades disponíveis</span>
            <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700">{filtered.length}</span>
          </div>
          <div id={listboxId} role="listbox" className="max-h-56 overflow-y-auto p-1.5 overscroll-contain">
            {filtered.map((option, index) => {
              const isSelected = option.id === value;
              const isActive = index === activeIndex;
              return (
                <button
                  id={`${listboxId}-${option.id}`}
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                    isSelected ? 'bg-cyan-50' : isActive ? 'bg-slate-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    isSelected ? 'border-cyan-100 bg-white text-cyan-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}>
                    <Building2 size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black text-slate-700">{option.nome}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400">{formatCnpj(option.cpfCnpj)}</span>
                  </span>
                  {isSelected ? <Check size={16} className="shrink-0 text-cyan-700" /> : null}
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-bold text-slate-600">Nenhuma faculdade encontrada</p>
                <p className="mt-1 text-[10px] text-slate-400">Revise o nome ou CNPJ digitado.</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && !error && options.length === 0 ? (
        <span className="mt-2 block text-xs font-bold text-amber-700">
          Nenhuma PJ classificada como Faculdade parceira / afiliado está disponível neste polo.
        </span>
      ) : null}
    </div>
  );
};

export default ConvenioFaculdadePicker;
