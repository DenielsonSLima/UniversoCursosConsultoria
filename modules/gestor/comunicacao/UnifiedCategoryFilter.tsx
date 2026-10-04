import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import type { GestorCategory } from './gestor-comunicacao.types';

interface UnifiedCategoryFilterProps {
  categories: GestorCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
}

const UnifiedCategoryFilter: React.FC<UnifiedCategoryFilterProps> = ({ categories, value, onChange }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const label = value === null ? 'Todas as categorias'
    : categories.find((category) => category.id === value)?.nome || 'Categoria indisponível';
  const options = [{ id: null, nome: 'Todas as categorias' }, ...categories]
    .filter((category) => category.nome.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [open]);

  const choose = (categoryId: string | null) => { onChange(categoryId); setOpen(false); };
  const openOptions = () => { setQuery(''); setActive(0); setOpen(true); };

  return (
    <div ref={rootRef} className="relative">
      <Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        role="combobox"
        aria-label="Filtrar por categoria"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
        value={open ? query : label}
        onFocus={openOptions}
        onClick={() => { if (!open) openOptions(); }}
        onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) { openOptions(); return; }
            setActive((current) => Math.max(0, Math.min(options.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
          }
          if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); choose(options[active].id); }
        }}
        className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50 pl-9 pr-8 text-xs font-semibold text-slate-600 outline-none focus:border-blue-200 focus:bg-white"
      />
      <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      {open && (
        <div role="listbox" id={`${id}-options`} aria-label="Categorias do atendimento" className="absolute inset-x-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {options.map((category, index) => (
            <button
              key={category.id || 'all'}
              type="button"
              role="option"
              id={`${id}-option-${index}`}
              aria-selected={category.id === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(category.id)}
              onMouseEnter={() => setActive(index)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${index === active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >{category.nome}</button>
          ))}
          {options.length === 0 && <p className="px-3 py-4 text-xs font-medium text-slate-400">Nenhuma categoria encontrada.</p>}
        </div>
      )}
    </div>
  );
};

export default UnifiedCategoryFilter;
