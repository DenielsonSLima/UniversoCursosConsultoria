import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Copy, MoreVertical } from 'lucide-react';
import type { NfseModel } from '../types/nfse.types';
import './nfse-model-actions.css';

interface Props {
  model: NfseModel;
  disabled: boolean;
  onClone: () => void;
  onDeactivate: () => void;
}

export default function NfseModelActionsMenu({ model, disabled, onClone, onDeactivate }: Props) {
  const id = useId();
  const trigger = useRef<globalThis.HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = Boolean(position && !disabled);
  const close = () => { setPosition(null); trigger.current?.focus(); };
  const show = () => {
    if (disabled || !trigger.current) return;
    if (open) { close(); return; }
    const rect = trigger.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 104 > window.innerHeight ? Math.max(8, rect.top - 100) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)) });
  };
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => panel.current?.querySelector<globalThis.HTMLButtonElement>('button:not(:disabled)')?.focus());
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    };
    const hide = () => setPosition(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open]);
  useEffect(() => { if (disabled) setPosition(null); }, [disabled]);
  const act = (action: () => void) => { close(); action(); };
  return <>
    <button ref={trigger} type="button" className="nfse-button nfse-button-secondary" disabled={disabled}
      aria-label={`Mais ações do modelo ${model.name}`} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={show}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}>
      <MoreVertical size={17} />
    </button>
    {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={`Ações do modelo ${model.name}`}
      className="nfse-model-actions-menu" style={position!}
      onBlur={event => {
        if (!(event.relatedTarget instanceof Node) || (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current)) setPosition(null);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key === 'Tab') { close(); return; }
        const items = Array.from<globalThis.HTMLButtonElement>(panel.current?.querySelectorAll<globalThis.HTMLButtonElement>('button:not(:disabled)') || []);
        const current = items.indexOf(document.activeElement as globalThis.HTMLButtonElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : event.key === 'ArrowDown' ? (current + 1) % items.length
            : event.key === 'ArrowUp' ? (current - 1 + items.length) % items.length : null;
        if (index !== null) { event.preventDefault(); items[index]?.focus(); }
      }}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => act(onClone)}><Copy size={15} />Clonar</button>
      {!model.inherited && model.canManage !== false && <button type="button" role="menuitem" tabIndex={-1}
        disabled={!model.active} onClick={() => act(onDeactivate)}><Ban size={15} />Inativar</button>}
    </div>, document.body)}
  </>;
}
