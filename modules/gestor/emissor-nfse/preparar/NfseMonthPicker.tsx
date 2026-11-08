import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNfseMonth, NFSE_MONTH_NAMES } from './nfse-month.presentation';
import './nfse-month-picker.css';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export default function NfseMonthPicker({ id, value, onChange, inputRef }: Props) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(value.slice(0, 4));
  const [position, setPosition] = useState({ left: 8, top: 0 });
  const monthIndex = Number(value.slice(5, 7)) - 1;
  const validYear = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= 2199;
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) inputRef.current?.focus();
  };
  const show = () => { setYear(value.slice(0, 4)); setOpen(true); };
  const choose = (index: number) => {
    if (!validYear) return;
    const nextValue = `${year}-${String(index + 1).padStart(2, '0')}`;
    if (nextValue !== value) onChange(nextValue);
    close();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = panelRef.current?.offsetHeight ?? 280;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 316)),
        top: Math.max(8, rect.bottom + height + 14 <= window.innerHeight ? rect.bottom + 6 : rect.top - height - 6),
      });
    };
    reposition();
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus());
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  const handlePanelKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      const fields: HTMLElement[] = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? []);
      const current = fields.indexOf(document.activeElement as HTMLElement);
      const next = current + (event.shiftKey ? -1 : 1);
      if (next < 0 || next >= fields.length) close();
      else fields[next].focus();
    }
  };

  return <div ref={rootRef} className="nfse-month-picker">
    <input ref={inputRef} id={id} type="text" readOnly role="combobox" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? panelId : undefined} aria-label="Mês de referência"
      value={formatNfseMonth(value)}
      onClick={() => open ? close() : show()}
      onKeyDown={event => {
        if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); show(); }
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
      }} />
    <ChevronDown size={15} aria-hidden="true" />
    {open && createPortal(<div ref={panelRef} id={panelId} role="dialog" aria-label="Escolher mês e ano"
      className="institutional-select-panel nfse-month-panel" style={position} onKeyDown={handlePanelKey}
      onMouseDown={event => { if ((event.target as HTMLElement).closest('button')) event.preventDefault(); }}>
      <div className="nfse-month-year">
        <button type="button" aria-label="Ano anterior" disabled={!validYear || Number(year) <= 1900}
          onClick={() => setYear(String(Number(year) - 1))}><ChevronLeft size={16} /></button>
        <input type="text" inputMode="numeric" aria-label="Ano de referência" maxLength={4} value={year}
          aria-invalid={!validYear || undefined} onChange={event => setYear(event.target.value.replace(/\D/g, ''))} />
        <button type="button" aria-label="Próximo ano" disabled={!validYear || Number(year) >= 2199}
          onClick={() => setYear(String(Number(year) + 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="nfse-month-options">{NFSE_MONTH_NAMES.map((name, index) => <button key={name} type="button"
        disabled={!validYear} aria-pressed={year === value.slice(0, 4) && index === monthIndex}
        onClick={() => choose(index)}>{name}</button>)}</div>
      {!validYear && <p role="status">Informe um ano entre 1900 e 2199.</p>}
    </div>, document.body)}
  </div>;
}
