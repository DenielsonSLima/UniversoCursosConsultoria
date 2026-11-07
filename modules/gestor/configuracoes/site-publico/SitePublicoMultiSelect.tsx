import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { textMatchesSearch } from '../../../../lib/search';

interface SitePublicoMultiSelectProps {
  value: readonly string[];
  options: readonly { value: string; label: string }[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
}

/** Closed IDs stay selected while a local search narrows the visible checkboxes. */
export function SitePublicoMultiSelect({ value, options, onChange, ariaLabel }: SitePublicoMultiSelectProps) {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => options.filter(option => textMatchesSearch(search, [option.label])), [options, search]);
  const selected = new Set(value);
  const toggle = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id); else next.add(id);
    // A native multiple select returns selectedOptions in option order.
    onChange(options.filter(option => next.has(option.value)).map(option => option.value));
  };

  return (
    <div className="config-multi-select mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label={ariaLabel}>
      <label className="relative block border-b border-slate-100">
        <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          aria-label={`Pesquisar ${ariaLabel.toLocaleLowerCase('pt-BR')}`}
          placeholder="Pesquisar opções…" className="h-[38px] w-full bg-white pl-9 pr-3 text-[13px] outline-none max-sm:min-h-11 max-sm:text-base" />
      </label>
      <div className="max-h-44 space-y-1 overflow-y-auto p-2">
        {visible.map(option => (
          <label key={option.value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50 max-sm:min-h-11">
            <input type="checkbox" checked={selected.has(option.value)} onChange={() => toggle(option.value)}
              className="h-4 w-4 shrink-0 accent-blue-600" />
            <span className="min-w-0 break-words">{option.label}</span>
          </label>
        ))}
        {visible.length === 0 && <p role="status" className="px-2 py-3 text-xs text-slate-500">Nenhuma opção encontrada.</p>}
      </div>
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{value.length} selecionado(s)</p>
    </div>
  );
}
