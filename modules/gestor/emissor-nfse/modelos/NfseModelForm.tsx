import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import { useSaveNfseModel } from '../hooks/useNfseMutations';
import { useNfseTabContext } from '../components/NfseTabContext';
import type { NfseModel } from '../types/nfse.types';
import NfseModelServiceFields, { NfseRequiredMark, type NfseModelFormValues, type SetNfseModelField } from './NfseModelServiceFields';
import NfseModelComplementaryFields from './NfseModelComplementaryFields';
import { useNfseFiscalCatalogs } from './hooks/useNfseFiscalCatalogs';
import { useNfseModelDescriptionPreview } from './hooks/useNfseModelDescriptionPreview';
import './nfse-model-form.css';

interface NfseModelFormProps {
  model?: NfseModel; onClose: () => void; onSaved: (message: string) => void;
}

const NfseModelForm: React.FC<NfseModelFormProps> = ({ model, onClose, onSaved }) => {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<React.ElementRef<'form'>>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const closeBlockedRef = useRef(false);
  const { scope } = useNfseTabContext();
  const [fields, setFields] = useState<NfseModelFormValues>(() => ({
    name: model?.name || '', nationalServiceCode: model?.nationalServiceCode || '',
    serviceDescription: model?.serviceDescription || '', nbsCode: model?.nbsCode || '',
    operationIndicatorCode: model?.operationIndicatorCode || '', issTreatment: model?.issTreatment || '',
    immunityType: model?.immunityType || '', technicalResponsibilityDocument: model?.technicalResponsibilityDocument || '',
    referenceDocument: model?.referenceDocument || '', complementaryInfo: model?.complementaryInfo || '',
    orderReference: model?.orderReference || '', active: model?.active ?? true,
  }));
  const [specialTreatment, setSpecialTreatment] = useState<boolean | null>(
    model?.issTreatment ? model.issTreatment !== 'TRIBUTAVEL' : null,
  );
  const setField: SetNfseModelField = (key, value) => setFields((current) => ({ ...current, [key]: value }));
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const save = useSaveNfseModel(scope);
  const catalogQuery = useNfseFiscalCatalogs();
  const descriptionPreview = useNfseModelDescriptionPreview(scope, fields.serviceDescription);
  const catalogs = catalogQuery.data;
  const allowed = Boolean(scope && descriptionPreview.ready && catalogs && !catalogQuery.isPending && !catalogQuery.error
    && catalogs.nationalServices.some((option) => option.code === fields.nationalServiceCode)
    && catalogs.nbs.some((option) => option.code === fields.nbsCode)
    && (!fields.operationIndicatorCode || catalogs.operationIndicators.some((option) => option.code === fields.operationIndicatorCode)));
  onCloseRef.current = onClose;
  closeBlockedRef.current = save.isPending;

  // Same modal lifecycle as the institutional product-type form: isolate the
  // background, contain focus, and restore the opener without changing the list.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlayRef.current
        && !element.classList.contains('institutional-select-panel'))
      .map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    document.body.style.overflow = 'hidden';
    for (const item of background) {
      item.element.inert = true;
      item.element.setAttribute('aria-hidden', 'true');
    }
    const focusFrame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!closeBlockedRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button, input, textarea, summary, [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element): element is HTMLElement => (
        element instanceof HTMLElement && !element.matches(':disabled') && !element.hidden
        && element.getClientRects().length > 0
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
    if (!allowed || save.isPending || !fields.issTreatment || specialTreatment === null) return;
    if (fields.issTreatment === 'IMUNIDADE' && !fields.immunityType) return;
    const input = {
      ...fields, id: model?.id, expectedVersion: model?.version,
      name: fields.name.trim(), serviceDescription: fields.serviceDescription.trim(),
      nationalServiceCode: fields.nationalServiceCode.trim(), nbsCode: fields.nbsCode.trim(),
      operationIndicatorCode: fields.operationIndicatorCode.trim(), issTreatment: fields.issTreatment,
      immunityType: fields.issTreatment === 'IMUNIDADE' ? fields.immunityType || null : null,
      technicalResponsibilityDocument: fields.technicalResponsibilityDocument.trim(),
      referenceDocument: fields.referenceDocument.trim(), complementaryInfo: fields.complementaryInfo.trim(),
      orderReference: fields.orderReference.trim(),
    };
    if (!input.name || !input.serviceDescription) return;
    const fingerprint = JSON.stringify(input);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await save.mutateAsync({ ...input, requestId: request.current.id });
      onSaved('Modelo disponível para este estabelecimento.');
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
      aria-busy={save.isPending}
      tabIndex={-1}
      className="nfse-model-dialog w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl"
      onSubmit={(event) => void submit(event)}
    >
      <div className="nfse-section-heading"><h2 id={titleId}>{model ? 'Editar modelo' : 'Novo modelo'}</h2><button type="button" className="nfse-button nfse-button-secondary shrink-0" onClick={onClose} disabled={save.isPending} aria-label="Fechar formulário do modelo"><X size={16} /></button></div>
      <div className="nfse-model-body">
        <fieldset className="nfse-model-fields" disabled={save.isPending}>
          <div className="nfse-model-section nfse-model-grid">
            <label className="nfse-field"><span>Nome do modelo<NfseRequiredMark /></span><input ref={initialFocusRef} required maxLength={120} value={fields.name} onChange={(event) => setField('name', event.target.value)} placeholder="Ex.: Mensalidade de curso técnico" /></label>
            <label className="nfse-model-active"><input type="checkbox" checked={fields.active} onChange={(event) => setField('active', event.target.checked)} />Modelo ativo</label>
          </div>
          <NfseModelServiceFields fields={fields} setField={setField} specialTreatment={specialTreatment}
            descriptionPreview={descriptionPreview}
            catalogs={catalogs} catalogsLoading={catalogQuery.isPending} catalogsError={Boolean(catalogQuery.error)}
            onRetryCatalogs={() => { void catalogQuery.refetch(); }} onSpecialTreatmentChange={(value) => {
            setSpecialTreatment(value);
            setFields((current) => ({ ...current, issTreatment: value ? (current.issTreatment === 'TRIBUTAVEL' ? '' : current.issTreatment) : 'TRIBUTAVEL', immunityType: value ? current.immunityType : '' }));
          }} />
          <NfseModelComplementaryFields fields={fields} setField={setField} />
        </fieldset>
        {save.error && <div className="nfse-notice" role="alert">Não foi possível salvar o modelo. Revise os campos e tente novamente.</div>}
      </div>
      <div className="nfse-footer">
        {!scope && <span>Salvamento indisponível.</span>}
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
