import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import { useSaveNfseModel } from '../hooks/useNfseMutations';
import { NFSE_WRITES_ENABLED } from '../services/nfse.runtime';
import { useNfseTabContext } from '../components/NfseTabContext';
import type { NfseModel } from '../types/nfse.types';

interface NfseModelFormProps {
  model?: NfseModel; onClose: () => void; onSaved: (message: string) => void;
}

const NfseModelForm: React.FC<NfseModelFormProps> = ({ model, onClose, onSaved }) => {
  const titleId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<React.ElementRef<'form'>>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const closeBlockedRef = useRef(false);
  const { scope, workspace, canRead } = useNfseTabContext();
  const [name, setName] = useState(model?.name || '');
  const [serviceDescription, setDescription] = useState(model?.serviceDescription || '');
  const [nationalServiceCode, setCode] = useState(model?.nationalServiceCode || '');
  const [active, setActive] = useState(model?.active ?? true);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const save = useSaveNfseModel(scope, workspace?.capabilities);
  const allowed = Boolean(NFSE_WRITES_ENABLED && canRead && workspace?.capabilities.manageModels);
  onCloseRef.current = onClose;
  closeBlockedRef.current = save.isPending;

  // Same modal lifecycle as the institutional product-type form: isolate the
  // background, contain focus, and restore the opener without changing the list.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlayRef.current)
      .map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    document.body.style.overflow = 'hidden';
    for (const item of background) {
      item.element.inert = true;
      item.element.setAttribute('aria-hidden', 'true');
    }
    const focusFrame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!closeBlockedRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button, input, textarea, [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element): element is HTMLElement => (
        element instanceof HTMLElement && !element.matches(':disabled') && !element.hidden
      ));
      event.preventDefault();
      if (!focusable.length) {
        dialogRef.current.focus();
        return;
      }
      const currentIndex = focusable.findIndex(element => element === document.activeElement);
      const nextIndex = currentIndex < 0
        ? event.shiftKey ? focusable.length - 1 : 0
        : (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[nextIndex].focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const item of background) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) item.element.removeAttribute('aria-hidden');
        else item.element.setAttribute('aria-hidden', item.ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!allowed || save.isPending || !name.trim() || !serviceDescription.trim() || !nationalServiceCode.trim()) return;
    const fields = { id: model?.id, expectedVersion: model?.version, name: name.trim(), serviceDescription: serviceDescription.trim(), nationalServiceCode: nationalServiceCode.trim(), active };
    const fingerprint = JSON.stringify(fields);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await save.mutateAsync({ ...fields, requestId: request.current.id });
      onSaved('O modelo foi confirmado e está disponível para este estabelecimento.');
    } catch { /* The mutation error is shown in the form; the request ID is preserved. */ }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="nfse-portal fixed inset-0 z-[10000] flex items-center justify-center bg-[#001a33]/60 p-3 text-[13px] text-[#18334b] backdrop-blur-sm sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !save.isPending) onClose();
      }}
    >
    <form
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={save.isPending}
      tabIndex={-1}
      className="max-h-[calc(100dvh-24px)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl sm:max-h-[92dvh]"
      onSubmit={(event) => void submit(event)}
    >
      <div className="nfse-section-heading sticky top-0 z-10 bg-white"><div className="min-w-0 flex-1"><h2 id={titleId}>{model ? 'Editar modelo' : 'Novo modelo'}</h2><p id={descriptionId}>{model ? `Versão ${model.version}. Alterações serão salvas em uma nova versão.` : 'Defina a descrição e a identificação do serviço para este estabelecimento.'}</p></div><button type="button" className="nfse-button nfse-button-secondary shrink-0" onClick={onClose} disabled={save.isPending} aria-label="Fechar formulário do modelo"><X size={16} /></button></div>
      <fieldset className="nfse-model-form" disabled={save.isPending}>
        <label className="nfse-field"><span>Nome do modelo</span><input ref={initialFocusRef} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Mensalidade de curso técnico" /></label>
        <label className="nfse-field"><span>Código de tributação nacional</span><input required maxLength={20} value={nationalServiceCode} onChange={(event) => setCode(event.target.value)} placeholder="Código validado para o serviço" /></label>
        <label className="nfse-field nfse-wide"><span>Descrição do serviço</span><textarea required maxLength={2000} value={serviceDescription} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição que será utilizada na preparação da nota" /></label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Modelo ativo</label>
        <p className="nfse-inline-help nfse-wide">Os valores virão dos recebimentos selecionados. O modelo deve corresponder ao serviço e ao enquadramento fiscal deste polo.</p>
      </fieldset>
      {save.error && <div className="nfse-notice" role="alert">Não foi possível confirmar o salvamento do modelo. Revise a disponibilidade antes de tentar novamente.</div>}
      <div className="nfse-footer sticky bottom-0 bg-white">
        {!allowed && <span>Salvamento indisponível.</span>}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <button type="button" className="nfse-button nfse-button-secondary" onClick={onClose} disabled={save.isPending}>Cancelar</button>
          <button type="submit" className="nfse-button nfse-button-primary" disabled={!allowed || save.isPending}><Save size={15} />{save.isPending ? 'Salvando…' : 'Salvar modelo'}</button>
        </div>
      </div>
    </form>
    </div>,
    document.body,
  );
};

export default NfseModelForm;
