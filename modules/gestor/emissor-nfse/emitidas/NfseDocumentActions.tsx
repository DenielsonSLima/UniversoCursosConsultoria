import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileCode, FileSearch, MoreHorizontal } from 'lucide-react';

interface Props { number: string | null; disabled: boolean; onPreview: () => void; onPdf: () => void; onXml: () => void }

export default function NfseDocumentActions({ number, disabled, onPreview, onPdf, onXml }: Props) {
  const id = useId();
  const trigger = useRef<globalThis.HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = Boolean(position && !disabled);
  const close = (restore = true) => { setPosition(null); if (restore) trigger.current?.focus(); };
  const show = () => {
    if (disabled || !trigger.current) return;
    if (open) { close(); return; }
    const rect = trigger.current.getBoundingClientRect();
    const height = 146;
    setPosition({ top: rect.bottom + height + 8 > window.innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - 188, window.innerWidth - 196)) });
  };
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => panel.current?.querySelector<globalThis.HTMLButtonElement>('button')?.focus());
    const pointer = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    };
    const hide = () => setPosition(null);
    document.addEventListener('pointerdown', pointer);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('pointerdown', pointer);
      window.removeEventListener('resize', hide); window.removeEventListener('scroll', hide, true); };
  }, [open]);
  useEffect(() => { if (disabled) setPosition(null); }, [disabled]);
  const act = (callback: () => void) => { close(); callback(); };
  return <>
    <button ref={trigger} type="button" className="nfse-button nfse-button-secondary nfse-note-menu-trigger" disabled={disabled}
      aria-label={`Opções da nota ${number ?? ''}`} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={show}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}>
      <MoreHorizontal size={18} />
    </button>
    {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={`Opções da nota ${number ?? ''}`}
      className="nfse-portal nfse-note-menu" style={position!} onBlur={event => {
        if (event.relatedTarget === trigger.current) return;
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPosition(null);
      }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key === 'Tab') { close(); return; }
        const items = Array.from<globalThis.HTMLButtonElement>(panel.current?.querySelectorAll<globalThis.HTMLButtonElement>('button') ?? []);
        const active = items.indexOf(document.activeElement as globalThis.HTMLButtonElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : event.key === 'ArrowDown' ? (active + 1) % items.length
            : event.key === 'ArrowUp' ? (active - 1 + items.length) % items.length : null;
        if (index !== null) { event.preventDefault(); items[index]?.focus(); }
      }}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => act(onPreview)}><FileSearch size={16} />Visualizar nota</button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => act(onPdf)}><Download size={16} />Baixar PDF</button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => act(onXml)}><FileCode size={16} />Baixar XML</button>
    </div>, document.body)}
  </>;
}
