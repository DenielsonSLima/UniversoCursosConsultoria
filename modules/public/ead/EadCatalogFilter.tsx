import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { textMatchesSearch } from '../../../lib/search';

interface EadCatalogFilterProps<Value extends string> {
  label: string;
  icon?: React.ReactNode;
  value: Value;
  options: { value: Value; label: string }[];
  onChange: (value: Value) => void;
}

export default function EadCatalogFilter<Value extends string>({
  label, icon, value, options, onChange,
}: EadCatalogFilterProps<Value>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<React.ElementRef<'li'> | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedLabel = options.find((option) => option.value === value)?.label || '';
  const filtered = options.filter((option) => textMatchesSearch(query, [option.label]));
  const listId = `${id}-options`;

  const close = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  const choose = (nextValue: Value) => {
    onChange(nextValue);
    close();
  };

  return (
    <div ref={rootRef} className="relative min-w-0 space-y-2">
      <label htmlFor={id} className="flex h-4 items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {icon}{label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeIndex >= 0 && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          value={open ? query : selectedLabel}
          placeholder={selectedLabel}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={close}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              if (filtered.length) {
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                setActiveIndex((current) => current < 0
                  ? (direction > 0 ? 0 : filtered.length - 1)
                  : (current + direction + filtered.length) % filtered.length);
              }
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (filtered[activeIndex]) choose(filtered[activeIndex].value);
            } else if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            } else if (event.key === 'Tab') {
              close();
            }
          }}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-4 pr-11 text-xs font-black text-slate-700 outline-none transition-all placeholder:text-slate-700 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${open ? 'Fechar' : 'Abrir'} opções de ${label}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) close();
            else {
              inputRef.current?.focus();
              setOpen(true);
            }
          }}
          className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-xl text-slate-400 hover:text-blue-600"
        >
          <ChevronDown aria-hidden="true" size={16} className={open ? 'rotate-180' : ''} />
        </button>
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
          {filtered.map((option, index) => (
            <li
              id={`${listId}-${index}`}
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option.value)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-xs font-bold ${activeIndex === index ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" size={16} className="shrink-0 text-blue-600" />}
            </li>
          ))}
          {filtered.length === 0 && <li role="presentation" className="px-4 py-3 text-xs text-slate-500">Nenhuma opção encontrada.</li>}
        </ul>
      )}
    </div>
  );
}
