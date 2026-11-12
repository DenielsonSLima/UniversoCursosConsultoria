import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { textMatchesSearch } from '../../../lib/search';
import './institutional-select.css';

export interface InstitutionalSelectOption {
  value: string;
  label: string;
  keywords?: string;
  disabled?: boolean;
}

interface InstitutionalSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly InstitutionalSelectOption[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  allowClear?: boolean;
  required?: boolean;
  id?: string;
  ariaDescribedBy?: string;
  remoteSearch?: {
    onSearchChange: (query: string) => void;
    selectedLabel?: string;
    minLength?: number;
    maxLength?: number;
  };
}

const InstitutionalSelect: React.FC<InstitutionalSelectProps> = ({
  value, onValueChange, options, ariaLabel, placeholder = 'Selecionar…', className = '',
  disabled = false, loading = false, error, allowClear = false, required = false, id, ariaDescribedBy, remoteSearch,
}) => {
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const statusId = `${generatedId}-status`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [ancestorDisabled, setAncestorDisabled] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ left: 8, top: 0, width: 240, maxHeight: 240 });
  const selected = options.find((option) => option.value === value);
  const serverFiltered = Boolean(remoteSearch);
  const filtered = useMemo(() => serverFiltered ? options : options.filter((option) => textMatchesSearch(query, [option.label, option.keywords])), [options, query, serverFiltered]);
  const effectiveDisabled = disabled || ancestorDisabled;
  const showPanel = open && !effectiveDisabled;
  const stateMessage = loading ? 'Carregando opções…' : error || (remoteSearch?.minLength && query.trim().length < remoteSearch.minLength
    ? `Digite ao menos ${remoteSearch.minLength} caracteres para buscar.` : options.length === 0
    ? 'Nenhuma opção disponível.' : filtered.length === 0 ? 'Nenhum resultado para esta busca.' : `${filtered.length} opção(ões).`);

  const close = () => {
    setOpen(false);
    setQuery('');
    remoteSearch?.onSearchChange('');
    setActiveIndex(-1);
  };
  const openPicker = () => {
    if (effectiveDisabled) return;
    if (!open) {
      setQuery('');
      remoteSearch?.onSearchChange('');
      setActiveIndex(-1);
      setOpen(true);
    }
  };
  const choose = (option: InstitutionalSelectOption) => {
    if (option.disabled || loading || error || inputRef.current?.matches(':disabled')) return;
    onValueChange(option.value);
    close();
  };

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const observer = new globalThis.MutationObserver(() => setAncestorDisabled(!disabled && input.matches(':disabled')));
    let parent = input.parentElement;
    while (parent) {
      if (parent.tagName === 'FIELDSET') observer.observe(parent, { attributes: true, attributeFilter: ['disabled'] });
      parent = parent.parentElement;
    }
    setAncestorDisabled(!disabled && input.matches(':disabled'));
    return () => observer.disconnect();
  }, [disabled]);

  useEffect(() => {
    if (effectiveDisabled) close();
  }, [effectiveDisabled]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !value ? 'Selecione uma opção da lista.' : '');
  }, [required, value]);

  useLayoutEffect(() => {
    if (!showPanel) return undefined;
    const reposition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(rect.width, window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const useAbove = below < 180 && above > below;
      const maxHeight = Math.max(80, Math.min(280, useAbove ? above : below));
      const panelHeight = Math.min(panelRef.current?.scrollHeight || maxHeight, maxHeight);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: useAbove ? Math.max(8, rect.top - panelHeight - 6) : rect.bottom + 6,
        width, maxHeight,
      });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [showPanel, query, filtered.length, loading, error]);

  useEffect(() => {
    if (!showPanel) return undefined;
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [showPanel]);

  useEffect(() => {
    if (!showPanel || activeIndex < 0) return;
    panelRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, showPanel]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (showPanel) {
        event.preventDefault();
        event.stopPropagation();
      }
      close();
    } else if (event.key === 'Tab') close();
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openPicker();
      if (loading || error) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      let next = activeIndex < 0 && direction < 0 ? 0 : activeIndex;
      for (let count = 0; count < filtered.length; count += 1) {
        next = (next + direction + filtered.length) % filtered.length;
        if (!filtered[next].disabled) {
          setActiveIndex(next);
          break;
        }
      }
    } else if (event.key === 'Enter' && showPanel) {
      event.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) choose(filtered[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} className={`institutional-select ${className}`}>
      <Search size={15} aria-hidden="true" className="institutional-select-search" />
      <input
        ref={inputRef}
        id={id || `${generatedId}-input`}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={showPanel ? listId : undefined}
        aria-activedescendant={showPanel && !loading && !error && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={[ariaDescribedBy, statusId].filter(Boolean).join(' ')}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        required={required && !value}
        value={showPanel ? query : selected?.label || (value ? remoteSearch?.selectedLabel : '') || ''}
        maxLength={remoteSearch?.maxLength}
        placeholder={loading ? 'Carregando opções…' : error ? 'Opções indisponíveis' : placeholder}
        title={selected?.label}
        onFocus={openPicker}
        onClick={openPicker}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value);
          remoteSearch?.onSearchChange(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {allowClear && value && !required && !effectiveDisabled ? (
        <button type="button" className="institutional-select-clear" aria-label={`Limpar ${ariaLabel}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onValueChange(''); close(); }}><X size={14} /></button>
      ) : null}
      {loading ? <Loader2 size={15} aria-hidden="true" className="institutional-select-chevron animate-spin" />
        : <ChevronDown size={15} aria-hidden="true" className={`institutional-select-chevron ${showPanel ? 'rotate-180' : ''}`} />}
      <span id={statusId} role="status" aria-live="polite" className="sr-only">{showPanel ? stateMessage : ''}</span>
      {showPanel && createPortal(
        <div ref={panelRef} className="institutional-select-panel" style={position} onMouseDown={(event) => event.preventDefault()}>
          <div id={listId} role="listbox" aria-label={ariaLabel} aria-busy={loading || undefined}>
            {!loading && !error && filtered.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                data-option-index={index}
                className={`institutional-select-option ${activeIndex === index ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {option.value === value ? <Check size={15} aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
          {(loading || error || filtered.length === 0) && <p className="institutional-select-status" role={error ? 'alert' : undefined}>{stateMessage}</p>}
        </div>, document.body,
      )}
    </div>
  );
};

export default InstitutionalSelect;
