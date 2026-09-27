import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';

import {
  filterComboboxOptions,
  mergeComboboxOptions,
  type EditableComboboxOption,
} from './editable-combobox.utils';

interface EditableComboboxProps<Metadata = unknown> {
  id?: string;
  name: string;
  value: string;
  options?: EditableComboboxOption<Metadata>[];
  loadOptions?: (query: string) => Promise<EditableComboboxOption<Metadata>[]>;
  onValueChange: (value: string, selectedOption: EditableComboboxOption<Metadata> | null) => void;
  placeholder?: string;
  className?: string;
  minSearchLength?: number;
  maxOptions?: number;
  debounceMs?: number;
  disabled?: boolean;
  required?: boolean;
  describedBy?: string;
  freeTextLabel?: string;
}

const EditableCombobox = <Metadata,>({
  id,
  name,
  value,
  options = [],
  loadOptions,
  onValueChange,
  placeholder,
  className,
  minSearchLength = 2,
  maxOptions = 12,
  debounceMs = 250,
  disabled = false,
  required = false,
  describedBy,
  freeTextLabel = 'Você também pode manter exatamente o texto digitado.',
}: EditableComboboxProps<Metadata>) => {
  const generatedId = useId();
  const inputId = id || `${name}-${generatedId}`;
  const listId = `${inputId}-options`;
  const statusId = `${inputId}-status`;
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState<EditableComboboxOption<Metadata>[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionRefs = useRef<Array<React.ElementRef<'li'> | null>>([]);

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  useEffect(() => {
    const query = value.trim();
    if (!loadOptions || query.length < minSearchLength) {
      setRemoteOptions([]);
      setIsLoading(false);
      setLoadFailed(false);
      return undefined;
    }

    let active = true;
    setIsLoading(true);
    setLoadFailed(false);
    const timer = setTimeout(() => {
      loadOptions(query)
        .then((results) => {
          if (active) setRemoteOptions(results);
        })
        .catch(() => {
          if (active) {
            setRemoteOptions([]);
            setLoadFailed(true);
          }
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, debounceMs);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [debounceMs, loadOptions, minSearchLength, value]);

  const visibleOptions = useMemo(() => filterComboboxOptions(
    mergeComboboxOptions(remoteOptions, options),
    value,
  ).slice(0, maxOptions), [maxOptions, options, remoteOptions, value]);
  const visibleOptionsKey = visibleOptions.map((option) => `${option.value}:${option.label}`).join('|');

  useEffect(() => {
    setActiveIndex(-1);
    optionRefs.current = [];
  }, [visibleOptionsKey]);

  useEffect(() => {
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = (option: EditableComboboxOption<Metadata>) => {
    onValueChange(option.value, option);
    setActiveIndex(-1);
    setIsOpen(false);
  };

  const hasSearch = value.trim().length >= minSearchLength;
  const showPanel = isOpen && !disabled;
  const statusMessage = isLoading
    ? 'Buscando sugestões…'
    : loadFailed
      ? 'Catálogo indisponível. O texto digitado ainda pode ser usado.'
      : visibleOptions.length > 0
        ? `${visibleOptions.length} sugestão(ões) disponível(is).`
        : hasSearch
          ? 'Nenhuma sugestão encontrada. O texto digitado será mantido.'
          : `Digite pelo menos ${minSearchLength} caracteres para pesquisar.`;

  return (
    <div className="relative">
      <div className="relative">
        <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={[describedBy, statusId].filter(Boolean).join(' ') || undefined}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`${className || ''} pl-10 pr-10`}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => {
              setIsOpen(false);
              setActiveIndex(-1);
            }, 120);
          }}
          onChange={(event) => {
            onValueChange(event.target.value, null);
            setActiveIndex(-1);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIsOpen(true);
              if (visibleOptions.length) setActiveIndex((current) => (current + 1) % visibleOptions.length);
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIsOpen(true);
              if (visibleOptions.length) {
                setActiveIndex((current) => (current <= 0 ? visibleOptions.length - 1 : current - 1));
              }
            }
            if (event.key === 'Enter' && activeIndex >= 0 && visibleOptions[activeIndex]) {
              event.preventDefault();
              choose(visibleOptions[activeIndex]);
            }
            if (event.key === 'Escape') {
              event.stopPropagation();
              setIsOpen(false);
              setActiveIndex(-1);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={showPanel ? 'Fechar sugestões' : 'Abrir sugestões'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsOpen((current) => !current)}
          disabled={disabled}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ChevronDown size={16} className={`transition-transform ${showPanel ? 'rotate-180' : ''}`} />}
        </button>
      </div>

      <span id={statusId} className="sr-only" role="status" aria-live="polite">{statusMessage}</span>
      {showPanel && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.45)]">
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1.5">
            {visibleOptions.length > 0 && (
              <>
              {visibleOptions.map((option, index) => (
                <li
                  id={`${listId}-${index}`}
                  key={`${option.value}-${option.label}`}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  role="option"
                  aria-selected={value === option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition ${
                    activeIndex === index ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{option.label}</span>
                    {option.description && <span className="block truncate text-xs text-slate-500">{option.description}</span>}
                  </span>
                  {value === option.value && <Check aria-hidden="true" size={15} className="shrink-0 text-blue-600" />}
                </li>
              ))}
              </>
            )}
          </ul>
          <div className={`border-t border-slate-100 px-3.5 py-2 text-xs ${loadFailed ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>
            {statusMessage} {value.trim() && !isLoading ? freeTextLabel : ''}
          </div>
        </div>
      )}
    </div>
  );
};

export default EditableCombobox;
