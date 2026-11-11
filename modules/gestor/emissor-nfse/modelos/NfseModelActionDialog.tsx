import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { NfseModel, NfseModelActionInput } from '../types/nfse.types';
import './nfse-model-actions.css';

interface Props {
  action: NfseModelActionInput['action'];
  model: NfseModel;
  busy: boolean;
  failed: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function NfseModelActionDialog({ action, model, busy, failed, onClose, onConfirm }: Props) {
  const title = useId();
  const description = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<globalThis.HTMLFormElement>(null);
  const cancel = useRef<globalThis.HTMLButtonElement>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay.current)
      .map(element => ({ element, inert: element.inert, hidden: element.getAttribute('aria-hidden') }));
    document.body.style.overflow = 'hidden';
    background.forEach(({ element }) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    const frame = window.requestAnimationFrame(() => cancel.current?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from<globalThis.HTMLButtonElement>(dialog.current?.querySelectorAll<globalThis.HTMLButtonElement>('button:not(:disabled)') || []);
      event.preventDefault();
      if (!items.length) { dialog.current?.focus(); return; }
      const index = items.indexOf(document.activeElement as globalThis.HTMLButtonElement);
      const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    };
    document.addEventListener('keydown', keydown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = overflow;
      background.forEach(({ element, inert, hidden }) => {
        element.inert = inert;
        if (hidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', hidden);
      });
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const clone = action === 'CLONE';
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlay} className="nfse-portal nfse-model-confirm-overlay" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form ref={dialog} className="nfse-model-confirm" role="alertdialog" aria-modal="true" aria-labelledby={title}
      aria-describedby={description} aria-busy={busy} tabIndex={-1} onSubmit={event => { event.preventDefault(); if (!busy) onConfirm(); }}>
      <h2 id={title}>{clone ? 'Clonar modelo?' : 'Inativar modelo?'}</h2>
      <p><strong>{model.name}</strong></p>
      <p id={description}>{clone
        ? 'Será criada uma cópia independente e ativa na unidade selecionada. O modelo original será preservado.'
        : 'O modelo deixará de ficar disponível para novos preparos, inclusive nas filiais que o utilizam da matriz. As notas e o histórico existentes serão preservados.'}</p>
      {failed && <p className="nfse-notice" role="alert">Não foi possível concluir. Tente novamente ou atualize a lista caso o modelo tenha mudado.</p>}
      <footer>
        <button ref={cancel} type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="nfse-button nfse-button-primary" disabled={busy}>{busy ? 'Processando…' : clone ? 'Clonar modelo' : 'Inativar modelo'}</button>
      </footer>
    </form>
  </div>, document.body);
}
