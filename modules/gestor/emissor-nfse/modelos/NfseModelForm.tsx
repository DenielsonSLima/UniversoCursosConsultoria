import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Files, Save, X } from 'lucide-react';
import { useSaveNfseModel } from '../hooks/useNfseMutations';
import { useNfseTabContext } from '../components/NfseTabContext';
import type { NfseModel } from '../types/nfse.types';
import NfseModelServiceFields, { NfseRequiredMark, type NfseModelFormValues, type SetNfseModelField } from './NfseModelServiceFields';
import NfseModelComplementaryFields from './NfseModelComplementaryFields';
import NfseModelSteps, { nfseModelSteps, type NfseModelStep } from './NfseModelSteps';
import NfseModelGeneralOptions from './NfseModelGeneralOptions';
import NfseModelServiceLocation from './NfseModelServiceLocation';
import NfseModelOperationType from './NfseModelOperationType';
import { isNfseServiceOptionsComplete } from './nfse-model-options-form';
import { createDefaultNfseModelPeopleOptionsV2, upgradeNfseModelPeopleOptions, isNfseModelPeopleOptionsComplete } from './services/nfse-model-people-options';
import NfseModelPeopleStep from './NfseModelPeopleStep';
import { useNfseFiscalCatalogs } from './hooks/useNfseFiscalCatalogs';
import { useNfseModelDescriptionPreview } from './hooks/useNfseModelDescriptionPreview';
import './nfse-model-form.css';
import NfseModelValuesFields from './NfseModelValuesFields';
import { createEmptyNfseModelValuesOptions, validateNfseModelValuesOptions, serializeNfseModelValuesOptions } from './services/nfse-model-values-options';
import { useNfseModelIssuerMetadata } from './hooks/useNfseModelIssuerMetadata';
import { nfseIbsCbsClassifications, nfsePresumedCredits } from './catalogs/nfse-ibscbs.catalog';
import { createNfseModelPresetContext, createNfseModelValuesContext } from './nfse-model-form-context';
import { normalizeNfseModelDraft } from './nfse-model-draft-normalization';
import { createDefaultNfseModelAdditionalOptions, validateNfseModelAdditionalOptions,
  serializeNfseModelAdditionalOptions } from './services/nfse-model-additional-options';
import NfseModelAdditionalPeopleFields from './NfseModelAdditionalPeopleFields';
import NfseModelAdditionalServiceFields from './NfseModelAdditionalServiceFields';
import NfseModelPresetReview from './NfseModelPresetReview';

const valuesCatalogs = { classifications: nfseIbsCbsClassifications, credits: nfsePresumedCredits };

interface NfseModelFormProps {
  model?: NfseModel; onClose: () => void; onSaved: (message: string) => void;
}

const NfseModelForm: React.FC<NfseModelFormProps> = ({ model, onClose, onSaved }) => {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<React.ElementRef<'form'>>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const closeBlockedRef = useRef(false);
  const { scope } = useNfseTabContext();
  const issuer = useNfseModelIssuerMetadata(scope);
  const [step, setStep] = useState<NfseModelStep>('people');
  const [fields, setFields] = useState<NfseModelFormValues>(() => normalizeNfseModelDraft({
    name: model?.name || '', nationalServiceCode: model?.nationalServiceCode || '',
    serviceDescription: model?.serviceDescription || '', nbsCode: model?.nbsCode || '',
    operationIndicatorCode: model?.operationIndicatorCode || '', issTreatment: model?.issTreatment || '',
    immunityType: model?.immunityType || '', technicalResponsibilityDocument: model?.technicalResponsibilityDocument || '',
    referenceDocument: model?.referenceDocument || '', complementaryInfo: model?.complementaryInfo || '',
    orderReference: model?.orderReference || '', active: model?.active ?? true,
    serviceOptions: model?.serviceOptions || null,
    peopleOptions: model?.peopleOptions
      ? upgradeNfseModelPeopleOptions(model.peopleOptions, model.serviceOptions?.includeIbsCbs ?? null)
      : model ? null : createDefaultNfseModelPeopleOptionsV2(),
    valuesOptions: model ? model.valuesOptions || null : createEmptyNfseModelValuesOptions(),
    additionalOptions: model?.additionalOptions || createDefaultNfseModelAdditionalOptions(),
  }, scope));
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [step]);
  const [specialTreatment, setSpecialTreatment] = useState<boolean | null>(
    model?.issTreatment ? model.issTreatment !== 'TRIBUTAVEL' : null,
  );
  const setField: SetNfseModelField = (key, value) => setFields((current) =>
    normalizeNfseModelDraft({ ...current, [key]: value }, scope, issuer.data));
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const save = useSaveNfseModel(scope);
  const catalogQuery = useNfseFiscalCatalogs();
  const descriptionPreview = useNfseModelDescriptionPreview(scope, fields.serviceDescription);
  const catalogs = catalogQuery.data;
  const valuesContext = createNfseModelValuesContext(scope, fields, issuer.data);
  const presetContext = createNfseModelPresetContext(scope, fields, issuer.data);
  const pendingIssues = [
    ...(!fields.name.trim() ? ['Informe o nome do pré-modelo.'] : []),
    ...(!issuer.data || issuer.isPending || issuer.error ? ['Confira o cadastro fiscal atual do estabelecimento em Configuração.'] : []),
    ...(!isNfseModelPeopleOptionsComplete(fields.peopleOptions, fields.serviceOptions?.includeIbsCbs ?? null)
      ? ['Complete as regras obrigatórias da etapa Configuração.'] : []),
    ...(!fields.serviceDescription.trim() || !fields.issTreatment || specialTreatment === null
      || (fields.issTreatment === 'IMUNIDADE' && !fields.immunityType)
      || !isNfseServiceOptionsComplete(fields.serviceOptions, fields.nationalServiceCode, fields.operationIndicatorCode, fields.issTreatment)
      ? ['Complete a descrição, a tributação e o local na etapa Serviço.'] : []),
    ...(!descriptionPreview.ready ? ['Aguarde a conferência da descrição do serviço.'] : []),
    ...(!catalogs || catalogQuery.isPending || catalogQuery.error ? ['Carregue os catálogos oficiais da etapa Serviço.'] : []),
    ...(catalogs && (!catalogs.nationalServices.some(option => option.code === fields.nationalServiceCode)
      || !catalogs.nbs.some(option => option.code === fields.nbsCode)
      || (fields.operationIndicatorCode && !catalogs.operationIndicators.some(option => option.code === fields.operationIndicatorCode)))
      ? ['Selecione os códigos de serviço, NBS e indicador nos catálogos oficiais.'] : []),
    ...validateNfseModelAdditionalOptions(fields.additionalOptions, presetContext),
    ...validateNfseModelValuesOptions(fields.valuesOptions, valuesContext, valuesCatalogs),
  ];
  const issues = [...new Set(pendingIssues)];
  const allowed = Boolean(scope && issues.length === 0);
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
      valuesOptions: serializeNfseModelValuesOptions(fields.valuesOptions),
      additionalOptions: serializeNfseModelAdditionalOptions(fields.additionalOptions),
    };
    if (!input.name || !input.serviceDescription) return;
    const fingerprint = JSON.stringify(input);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await save.mutateAsync({ ...input, requestId: request.current.id });
      onSaved('Pré-modelo disponível para este estabelecimento.');
    } catch { /* The mutation error is shown in the form; the request ID is preserved. */ }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="nfse-portal nfse-model-overlay"
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
      className="nfse-model-dialog"
      onSubmit={(event) => void submit(event)}
    >
      <header className="nfse-model-header">
        <div className="nfse-model-heading">
          <span className="nfse-model-heading-icon" aria-hidden="true"><Files size={20} /></span>
          <div><h2 id={titleId}>{model ? 'Editar pré-modelo' : 'Novo pré-modelo'}</h2>
            <p>Defina os dados e as regras para suas próximas notas de serviço.</p></div>
        </div>
        <button type="button" className="nfse-model-close" onClick={onClose} disabled={save.isPending}
          aria-label="Fechar formulário do pré-modelo"><X size={18} /></button>
      </header>
      <div className="nfse-model-section nfse-model-grid nfse-model-identity">
        <label className="nfse-field"><span>Nome do pré-modelo<NfseRequiredMark /></span><input ref={initialFocusRef} required maxLength={120} disabled={save.isPending} value={fields.name} onChange={(event) => setField('name', event.target.value)} placeholder="Ex.: Mensalidade de curso técnico" /></label>
        <label className="nfse-model-active nfse-model-status"><input type="checkbox" disabled={save.isPending} checked={fields.active} onChange={(event) => setField('active', event.target.checked)} /><span>Pré-modelo ativo<small>Disponível ao preparar uma nota</small></span></label>
      </div>
      <NfseModelSteps current={step} disabled={save.isPending} onChange={setStep} />
      <div ref={bodyRef} className="nfse-model-body">
        <fieldset className="nfse-model-fields" disabled={save.isPending}>
          {step === 'people' && <><NfseModelGeneralOptions section="ibs" value={fields.serviceOptions}
            onChange={options => setField('serviceOptions', options)} />
            <NfseModelPeopleStep scope={scope} value={fields.peopleOptions}
              onChange={options => setField('peopleOptions', options)} includeIbsCbs={fields.serviceOptions?.includeIbsCbs ?? null}
              governmentPurchase={fields.serviceOptions?.governmentPurchase ?? null} disabled={save.isPending}
              afterIssuer={<NfseModelGeneralOptions section="government" value={fields.serviceOptions}
                onChange={options => setField('serviceOptions', options)} />} />
            <NfseModelAdditionalPeopleFields value={fields.additionalOptions}
              onChange={value => setField('additionalOptions', value)} context={presetContext}
              disabled={save.isPending} /></>}
          {step === 'service' && <><NfseModelServiceLocation value={fields.serviceOptions}
            onChange={options => setField('serviceOptions', options)} /><NfseModelServiceFields fields={fields} setField={setField} specialTreatment={specialTreatment}
            descriptionPreview={descriptionPreview}
            catalogs={catalogs} catalogsLoading={catalogQuery.isPending} catalogsError={Boolean(catalogQuery.error)}
            onRetryCatalogs={() => { void catalogQuery.refetch(); }} onSpecialTreatmentChange={(value) => {
            setSpecialTreatment(value);
            setFields((current) => {
              return normalizeNfseModelDraft({ ...current, issTreatment: value ? (current.issTreatment === 'TRIBUTAVEL' ? '' as const : current.issTreatment) : 'TRIBUTAVEL' as const,
                immunityType: value ? current.immunityType : '' as const }, scope, issuer.data);
            });
          }} />
          <NfseModelOperationType options={fields.serviceOptions} nationalServiceCode={fields.nationalServiceCode}
            onChange={options => setField('serviceOptions', options)} />
          <NfseModelComplementaryFields fields={fields} setField={setField} />
          <NfseModelAdditionalServiceFields value={fields.additionalOptions}
            onChange={value => setField('additionalOptions', value)} context={presetContext} disabled={save.isPending} /></>}
          {step === 'values' && <NfseModelValuesFields value={fields.valuesOptions}
            onChange={value => setField('valuesOptions', value)} context={valuesContext}
            catalogs={valuesCatalogs} disabled={save.isPending} />}
          {step === 'review' && <>
            {issues.length > 0 && <section className="nfse-model-section nfse-model-pending" role="status">
              <h3>Para concluir o pré-modelo</h3><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
            </section>}
            <NfseModelPresetReview fields={fields} onEditStep={setStep} disabled={save.isPending}
              catalogs={catalogs} valuesCatalogs={valuesCatalogs} valuesProfile={valuesContext.profile} />
          </>}
        </fieldset>
        {save.error && <div className="nfse-notice" role="alert">Não foi possível salvar o pré-modelo. Revise os campos e tente novamente.</div>}
      </div>
      <footer className="nfse-footer nfse-model-footer">
        {!scope && <span>Salvamento indisponível.</span>}
        <div className="nfse-model-step-actions">
          <button type="button" className="nfse-button nfse-button-secondary" disabled={save.isPending || step === 'people'}
            onClick={() => setStep(nfseModelSteps[nfseModelSteps.findIndex(item => item.id === step) - 1].id)}><ArrowLeft size={15} />Voltar</button>
          <span className="nfse-model-progress">Etapa {nfseModelSteps.findIndex(item => item.id === step) + 1} de 4</span>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={save.isPending || step === 'review'}
            onClick={() => setStep(nfseModelSteps[nfseModelSteps.findIndex(item => item.id === step) + 1].id)}>Continuar<ArrowRight size={15} /></button>
        </div>
        <div className="nfse-model-save-actions">
          <button type="button" className="nfse-button nfse-button-secondary" onClick={onClose} disabled={save.isPending}>Cancelar</button>
          <button type="submit" className="nfse-button nfse-button-primary" disabled={!allowed || save.isPending}><Save size={15} />{save.isPending ? 'Salvando…' : 'Salvar pré-modelo'}</button>
        </div>
      </footer>
    </form>
    </div>,
    document.body,
  );
};

export default NfseModelForm;
