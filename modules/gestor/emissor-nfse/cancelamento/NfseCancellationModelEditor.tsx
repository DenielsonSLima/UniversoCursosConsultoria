import { useId, useRef, useState, type ComponentRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import type { NfseScope } from '../types/nfse.types';
import { useNfseStudentsDialog } from '../preparar/useNfseStudentsDialog';
import { cancellationCategories, cancellationReasons, cancellationModelDefinition, type NfseCancellationModel, type NfseCancellationModelDefinition, type NfseCancellationModelsService } from './nfse-cancellation-models.contract';
import { useSaveNfseCancellationModel } from './nfse-cancellation-models.queries';
import '../modelos/nfse-model-form.css';
import './nfse-cancellation-models.css';
interface Props { scope: NfseScope; model?: NfseCancellationModel; copy?: boolean; service?: NfseCancellationModelsService; onClose: () => void; onSaved: (model: NfseCancellationModel) => void }
export default function NfseCancellationModelEditor({ scope, model, copy, service, onClose, onSaved }: Props) {
  const id = useId(), save = useSaveNfseCancellationModel(scope, service);
  const [name, setName] = useState(model ? copy ? `${model.name} · personalizado`.slice(0, 120) : model.name : '');
  const [category, setCategory] = useState<NfseCancellationModelDefinition['category'] | ''>(model?.category || '');
  const [reason, setReason] = useState<NfseCancellationModelDefinition['reasonCode'] | ''>(model?.reasonCode || '');
  const [template, setTemplate] = useState(model?.textTemplate || ''), [active, setActive] = useState(model?.active ?? true);
  const close = () => { if (!save.isPending) onClose(); };
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<ComponentRef<'button'>>(close);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  let definition: NfseCancellationModelDefinition | null = null;
  try { definition = cancellationModelDefinition({ name, category, active, eventCode: '101101', reasonCode: reason, textTemplate: template } as NfseCancellationModelDefinition); } catch { /* Explicit required fields remain editable. */ }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!definition || save.isPending) return;
    const modelId = model && !copy && model.source === 'CUSTOM' ? model.id : null, expectedVersion = modelId ? model!.version : null;
    const fingerprint = JSON.stringify({ scope, definition, modelId, expectedVersion });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try { const result = await save.mutateAsync({ requestId: request.current.id, definition, modelId, expectedVersion }); onSaved(result.model); } catch { /* Keep intent ID and fields for an idempotent retry. */ }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-model-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialogRef} className="nfse-model-dialog nfse-cancel-model-dialog" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} aria-busy={save.isPending}>
      <form onSubmit={event => void submit(event)}>
        <header className="nfse-model-header"><div className="nfse-model-heading"><div><h2 id={id}>{model && !copy ? 'Editar justificativa' : 'Nova justificativa de cancelamento'}</h2><p>Texto formal reutilizável. Os fatos e a nota são conferidos no cancelamento.</p></div></div>
          <button ref={initialFocusRef} type="button" className="nfse-model-close" aria-label="Fechar modelo de cancelamento" disabled={save.isPending} onClick={close}><X size={17} /></button></header>
        <div className="nfse-model-body"><fieldset disabled={save.isPending} className="nfse-model-fields"><section className="nfse-model-section nfse-model-grid">
          <label className="nfse-field nfse-wide"><span>Nome do modelo</span><input aria-label="Nome do modelo de cancelamento" value={name} required maxLength={120} onChange={event => setName(event.target.value)} /></label>
          <div className="nfse-field"><label>Categoria</label><InstitutionalSelect ariaLabel="Categoria da justificativa" value={category} required options={cancellationCategories}
            onValueChange={value => { if (cancellationCategories.some(item => item.value === value)) setCategory(value as typeof category); }} /></div>
          <div className="nfse-field"><label>Motivo fiscal</label><InstitutionalSelect ariaLabel="Motivo fiscal do modelo" value={reason} required options={cancellationReasons}
            onValueChange={value => { if (cancellationReasons.some(item => item.value === value)) setReason(value as typeof reason); }} /></div>
          <label className="nfse-field nfse-wide"><span>Justificativa formal</span><textarea aria-label="Texto do modelo de cancelamento" value={template} minLength={15} maxLength={255} required onChange={event => setTemplate(event.target.value)} /></label>
          <p className="nfse-inline-help nfse-wide">Use {'{{detalhe}}'} para os fatos que serão completados e conferidos na operação. Nenhuma pessoa, nota ou valor é preenchido automaticamente.</p>
          <label className="nfse-model-active"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Modelo ativo</label>
        </section></fieldset>
          {save.error && <p className="nfse-download-error" role="alert">{save.error.message}</p>}
        </div>
        <footer className="nfse-footer"><button type="button" className="nfse-button nfse-button-secondary" disabled={save.isPending} onClick={close}>Voltar</button>
          <button type="submit" className="nfse-button nfse-button-primary" disabled={!definition || save.isPending}><Save size={15} />{save.isPending ? 'Salvando…' : 'Salvar modelo de cancelamento'}</button></footer>
      </form>
    </div>
  </div>, document.body);
}
