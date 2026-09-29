import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { textMatchesSearch } from '../../../../../../lib/search';
import { useOrgaosEmissores } from '../../../orgaos-emissores.service';
import { INPUT_CLS, LABEL_CLS } from './parceiro-aluno-form.constants';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  inputClassName?: string;
  labelClassName?: string;
}

export default function OrgaoEmissorPicker({ value, onChange, label = 'Órgão Emissor',
  inputClassName = INPUT_CLS, labelClassName = LABEL_CLS }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 240 });
  const catalog = useOrgaosEmissores();
  const options = (catalog.data || []).filter((item) => textMatchesSearch(query, [item.sigla, item.nome]));
  const selected = catalog.data?.find((item) => item.sigla === value);

  useEffect(() => {
    if (!open) return;
    const positionPanel = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upward = below < 160 && above > below;
      const maxHeight = Math.max(80, Math.min(280, (upward ? above : below) - 48));
      setPosition({ top: upward ? rect.top - maxHeight - 48 : rect.bottom + 6, left: rect.left,
        width: rect.width, maxHeight });
    };
    const onOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [open]);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  const show = () => { setQuery(''); setActive(-1); setOpen(true); };
  const choose = (sigla: string) => { onChange(sigla); setOpen(false); setQuery(''); setActive(-1); };
  const status = catalog.isPending ? 'Carregando órgãos emissores…'
    : catalog.isError ? 'Não foi possível carregar os órgãos emissores.'
      : !catalog.data?.length ? 'Nenhum órgão emissor disponível.'
        : !options.length ? 'Nenhum órgão encontrado.' : 'Digite para pesquisar e selecione uma opção.';

  return (
    <div ref={rootRef}>
      <label htmlFor={id} className={labelClassName}>{label}</label>
      <div className="relative">
        <input ref={inputRef} id={id} role="combobox" autoComplete="off" type="text"
          aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
          aria-activedescendant={open && !catalog.isError && active >= 0 && options[active] ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-help`} value={open ? query : value}
          className={`${inputClassName} pr-16`} placeholder="Pesquise e selecione"
          onFocus={show} onClick={() => { if (!open) show(); }}
          onBlur={(event) => {
            if (!panelRef.current?.contains(event.relatedTarget as Node)
              && !rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
          }}
          onChange={(event) => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
            if (event.key === 'Tab') setOpen(false);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) { show(); return; }
              if (options.length) setActive((previous) => event.key === 'ArrowDown'
                ? (previous + 1) % options.length : previous <= 0 ? options.length - 1 : previous - 1);
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (active >= 0 && options[active] && !catalog.isError) choose(options[active].sigla);
            }
          }} />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {value && <button type="button" aria-label="Limpar órgão emissor"
            className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => choose('')}><X size={14} /></button>}
          <button type="button" aria-label={open ? 'Fechar órgãos emissores' : 'Listar órgãos emissores'}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { if (open) setOpen(false); else { inputRef.current?.focus(); show(); } }}>
            {catalog.isFetching ? <Loader2 size={16} className="animate-spin" /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      <p id={`${id}-help`} className="mt-1 text-[10px] text-slate-500">
        {value && !selected && catalog.isSuccess ? `Registro anterior: ${value}. Se alterar, selecione um órgão da lista.`
          : selected ? `${selected.sigla} — ${selected.nome}` : 'Opcional. Apenas opções da lista são salvas.'}
      </p>
      {open && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}
          onKeyDown={(event) => {
            if (event.key === 'Tab') setOpen(false);
            if (event.key === 'Escape') { event.stopPropagation(); inputRef.current?.focus(); setOpen(false); }
          }}
          className="z-[10000] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <ul id={`${id}-list`} role="listbox" aria-label="Órgãos emissores" style={{ maxHeight: position.maxHeight }}
            className="overflow-y-auto py-1">
            {!catalog.isError && options.map((item, index) => (
              <li id={`${id}-option-${index}`} key={item.sigla} role="option" aria-selected={value === item.sigla}
                onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item.sigla)}
                onMouseEnter={() => setActive(index)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${active === index ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-800">{item.sigla}</span>
                  <span className="block text-xs text-slate-500">{item.nome}</span></span>
                {value === item.sigla && <Check size={16} className="text-indigo-600" />}
              </li>
            ))}
          </ul>
          <p role="status" className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{status}</p>
          {catalog.isError && <button type="button" onClick={() => void catalog.refetch()}
            className="px-3 pb-3 text-xs font-semibold text-indigo-600">Tentar novamente</button>}
        </div>, document.body,
      )}
    </div>
  );
}
