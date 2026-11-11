import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { searchMunicipalityCatalog, searchNationalityCatalog } from '../../../shared/catalogs/person-reference-catalog.service';
import '../../../shared/components/institutional-select.css';

interface Option { value: string; label: string }
interface Props {
  id: string;
  label: string;
  kind: 'country' | 'municipality';
  value: string;
  selectedLabel?: string | null;
  onChange: (option: Option) => void;
}

/** Closed catalog selection: typing searches the existing RPC and never becomes a fiscal code. */
export default function NfseModelLocationPicker({ id, label, kind, value, selectedLabel, onChange }: Props) {
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const statusId = `${generatedId}-status`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [ancestorDisabled, setAncestorDisabled] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 0, width: 240, maxHeight: 240 });
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const catalog = useQuery({
    queryKey: ['nfse-model-location', kind, debouncedQuery],
    queryFn: async (): Promise<Option[]> => kind === 'country'
      ? (await searchNationalityCatalog(debouncedQuery)).map(option => ({ value: option.metadata?.codigoIso3 || '', label: option.metadata?.pais || option.label })).filter(option => /^[A-Z]{3}$/.test(option.value))
      : (await searchMunicipalityCatalog(debouncedQuery)).map(option => ({ value: option.metadata?.codigoIbge || '', label: option.label })).filter(option => /^\d{7}$/.test(option.value)),
    enabled: open && !ancestorDisabled,
    staleTime: 60_000,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const options = catalog.data || [];
  const loading = open && (query.trim() !== debouncedQuery || catalog.isPending || catalog.isFetching);
  const close = () => { setOpen(false); setQuery(''); setActiveIndex(-1); };
  const openPicker = () => {
    if (inputRef.current?.matches(':disabled')) return;
    if (!open) { setOpen(true); setActiveIndex(-1); }
  };
  const choose = (option: Option) => {
    if (loading || catalog.error || inputRef.current?.matches(':disabled')) return;
    onChange(option); close();
  };
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const update = () => { const disabled = input.matches(':disabled'); setAncestorDisabled(disabled); if (disabled) close(); };
    const observer = new globalThis.MutationObserver(update);
    let ancestor = input.parentElement;
    while (ancestor) {
      if (ancestor.tagName === 'FIELDSET') observer.observe(ancestor, { attributes: true, attributeFilter: ['disabled'] });
      ancestor = ancestor.parentElement;
    }
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { inputRef.current?.setCustomValidity(value ? '' : 'Selecione uma opção do catálogo.'); }, [value]);
  useLayoutEffect(() => {
    if (!open || ancestorDisabled) return;
    const reposition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(rect.width, window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const useAbove = below < 180 && above > below;
      const maxHeight = Math.max(80, Math.min(280, useAbove ? above : below));
      const height = Math.min(panelRef.current?.scrollHeight || maxHeight, maxHeight);
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: useAbove ? Math.max(8, rect.top - height - 6) : rect.bottom + 6, width, maxHeight });
    };
    reposition();
    window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition, true);
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [open, ancestorDisabled, options.length, loading, catalog.error]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => {
    setActiveIndex(-1);
  }, [query, options]);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);
  const status = loading ? 'Buscando no catálogo…' : catalog.error ? 'Não foi possível consultar o catálogo.'
    : options.length ? `${options.length} opção(ões). Refine a busca para encontrar outros resultados.` : 'Nenhum resultado para esta busca.';
  return <div className="nfse-field">
    <label htmlFor={id}>{label}<span className="nfse-model-required" aria-hidden="true"> *</span></label>
    <div ref={rootRef} className="institutional-select">
      <Search size={15} aria-hidden="true" className="institutional-select-search" />
      <input ref={inputRef} id={id} role="combobox" autoComplete="off" spellCheck={false}
        aria-label={label} aria-autocomplete="list" aria-expanded={open && !ancestorDisabled}
        aria-controls={open ? listId : undefined} aria-activedescendant={open && !loading && !catalog.error && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={statusId} aria-required="true" aria-invalid={Boolean(catalog.error) || undefined}
        value={open ? query : selectedLabel || value} required={!value} placeholder="Buscar no catálogo"
        onFocus={openPicker} onClick={openPicker} onBlur={close}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation(); } close(); }
          if (event.key === 'Tab') close();
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); openPicker();
            if (!loading && !catalog.error && options.length) {
              const direction = event.key === 'ArrowDown' ? 1 : -1;
              setActiveIndex(current => current < 0 ? direction > 0 ? 0 : options.length - 1 : (current + direction + options.length) % options.length);
            }
          }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (options[activeIndex]) choose(options[activeIndex]); }
        }} />
      {loading ? <Loader2 size={15} aria-hidden="true" className="institutional-select-chevron animate-spin" />
        : <ChevronDown size={15} aria-hidden="true" className="institutional-select-chevron" />}
      <span id={statusId} className="sr-only" role="status" aria-live="polite">{open ? status : ''}</span>
      {open && !ancestorDisabled && createPortal(<div ref={panelRef} className="institutional-select-panel" style={position} onMouseDown={event => event.preventDefault()}>
        {loading || catalog.error || !options.length ? <div className="institutional-select-empty" role={catalog.error ? 'alert' : 'status'}>
          {status}{catalog.error && <button type="button" className="nfse-button nfse-button-secondary" onClick={() => { void catalog.refetch(); }}>Tentar novamente</button>}
        </div> : <div id={listId} role="listbox" aria-label={label}>
          {options.map((option, index) => <button key={option.value} type="button" role="option" id={`${listId}-${index}`}
            aria-selected={value === option.value} data-option-index={index}
            className={`institutional-select-option ${activeIndex === index ? 'is-active' : ''}`}
            onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>
            <span>{option.label} <small>· {option.value}</small></span>{value === option.value && <Check size={15} aria-hidden="true" />}
          </button>)}
        </div>}
      </div>, document.body)}
    </div>
  </div>;
}
