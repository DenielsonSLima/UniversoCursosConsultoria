import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { textMatchesSearch } from '../../../../../lib/search';
import type { EadRefundCandidate } from '../ead-payment-review.service';

const refundLabel = (item: EadRefundCandidate) => `${item.descricao} · ${Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${item.dataPagamento?.slice(0, 10).split('-').reverse().join('/')}`;

interface Props {
  items: EadRefundCandidate[];
  value: string;
  loading: boolean;
  error: boolean;
  disabled: boolean;
  onChange: (id: string) => void;
  onRetry: () => void;
}

const EadRefundPicker: React.FC<Props> = ({ items, value, loading, error, disabled, onChange, onRetry }) => {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = items.find(item => item.id === value);
  const filtered = useMemo(() => items.filter(item => textMatchesSearch(search, [item.descricao, item.dataPagamento, item.comprovanteRef])), [items, search]);
  const select = (item: EadRefundCandidate) => { onChange(item.id); setOpen(false); setSearch(''); };

  useEffect(() => {
    const closeOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, id, open]);

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-2 block text-xs font-bold text-slate-700">Devolução já paga</label>
      <div className="relative">
        <input id={id} role="combobox" autoComplete="off" aria-expanded={open}
          aria-controls={`${id}-options`} aria-autocomplete="list"
          aria-activedescendant={open && filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          disabled={disabled} value={open ? search : selected ? refundLabel(selected) : ''}
          placeholder="Buscar uma devolução registrada no Financeiro"
          onFocus={() => { setOpen(true); setSearch(''); setActiveIndex(0); }}
          onClick={() => setOpen(true)}
          onChange={event => { setSearch(event.target.value); setActiveIndex(0); onChange(''); setOpen(true); }}
          onKeyDown={event => {
            if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return; }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setOpen(true);
              setActiveIndex(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault(); if (filtered[activeIndex]) select(filtered[activeIndex]);
            }
          }}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-3 pr-9 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100" />
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" />
      </div>
      {open && <div id={`${id}-options`} role="listbox" aria-label="Devoluções pagas"
        className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
        {loading ? <p role="status" className="flex items-center gap-2 p-3 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Consultando devoluções...</p>
          : error ? <button type="button" onClick={onRetry} className="p-3 text-xs text-rose-700">Não foi possível consultar. Tentar novamente</button>
          : filtered.length === 0 ? <p className="p-3 text-xs text-slate-500">{items.length ? 'Nenhuma devolução corresponde à busca.' : 'Nenhuma devolução paga disponível para este aluno.'}</p>
          : filtered.map((item, index) => <button key={item.id} id={`${id}-option-${index}`} role="option"
            aria-selected={value === item.id} type="button" tabIndex={-1}
            onMouseDown={event => event.preventDefault()} onClick={() => select(item)}
            onMouseEnter={() => setActiveIndex(index)}
            className={`w-full rounded-lg px-3 py-2 text-left text-xs ${activeIndex === index ? 'bg-blue-50 text-blue-800' : 'text-slate-700'}`}>
            {refundLabel(item)}
          </button>)}
      </div>}
    </div>
  );
};

export default EadRefundPicker;
