import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, MoreVertical, Search } from 'lucide-react';
interface Props { number: string | null; disabled: boolean; canCancel: boolean; onConsult: () => void; onCancel: () => void }
export default function NfseDocumentOperationMenu({ number, disabled, canCancel, onConsult, onCancel }: Props) {
  const id = useId(), trigger = useRef<globalThis.HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = Boolean(position && !disabled);
  const close = () => { setPosition(null); trigger.current?.focus(); };
  const show = () => {
    if (disabled || !trigger.current) return;
    if (open) { close(); return; }
    const rect = trigger.current.getBoundingClientRect(), height = 96;
    setPosition({ top: rect.bottom + height + 8 > window.innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)) });
  };
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => panel.current?.querySelector<globalThis.HTMLButtonElement>('button:not(:disabled)')?.focus());
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    };
    const hide = () => setPosition(null);
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', hide); window.addEventListener('scroll', hide, true);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', hide); window.removeEventListener('scroll', hide, true); };
  }, [open]);
  useEffect(() => { if (disabled) setPosition(null); }, [disabled]);
  const act = (action: () => void) => { close(); action(); };
  return <><button ref={trigger} type="button" className="nfse-button nfse-button-secondary nfse-operation-menu-trigger" disabled={disabled}
    aria-label={`Mais ações da NFS-e ${number || ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={show}
    onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}><MoreVertical size={17} /></button>
    {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={`Ações da operação NFS-e ${number || ''}`} className="nfse-operation-menu" style={position!}
      onBlur={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) setPosition(null); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key === 'Tab') { close(); return; }
        const items = Array.from<globalThis.HTMLButtonElement>(panel.current?.querySelectorAll<globalThis.HTMLButtonElement>('button:not(:disabled)') || []);
        const current = items.indexOf(document.activeElement as globalThis.HTMLButtonElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : event.key === 'ArrowUp' ? (current - 1 + items.length) % items.length : null;
        if (index !== null) { event.preventDefault(); items[index]?.focus(); }
      }}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => act(onConsult)}><Search size={15} />Consultar</button>
      <button type="button" role="menuitem" tabIndex={-1} disabled={!canCancel} onClick={() => { if (canCancel) act(onCancel); }}><Ban size={15} />Cancelar</button>
    </div>, document.body)}
  </>;
}
