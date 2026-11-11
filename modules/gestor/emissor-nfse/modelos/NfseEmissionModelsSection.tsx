import React, { useRef, useState } from 'react';
import { Download, Pencil, Plus } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import type { NfseModel, NfseModelActionInput, NfseScope } from '../types/nfse.types';
import NfseModelForm from './NfseModelForm';
import NfseModelExportModal from './NfseModelExportModal';
import { useNfseModels, useMutateNfseModel } from './hooks/useNfseModels';
import NfseModelActionsMenu from './NfseModelActionsMenu';
import NfseModelActionDialog from './NfseModelActionDialog';

export default function NfseEmissionModelsSection() {
  const { scope } = useNfseTabContext();
  return <NfseEmissionModelList key={JSON.stringify(scope)} />;
}

const NfseEmissionModelList: React.FC = () => {
  const { scope } = useNfseTabContext();
  const query = useNfseModels(scope);
  const [editor, setEditor] = useState<NfseModel | 'new' | null>(null);
  const [exporting, setExporting] = useState<{ model: NfseModel; scope: NfseScope } | null>(null);
  const { toasts, removeToast, toast } = useToast();
  const models = query.error ? [] : query.data?.rows || [];
  const mutation = useMutateNfseModel(scope);
  const [action, setAction] = useState<{ model: NfseModel; input: NfseModelActionInput } | null>(null);
  const requests = useRef(new Map<string, string>());
  const submitting = useRef(false);
  const chooseAction = (model: NfseModel, kind: NfseModelActionInput['action']) => {
    if (!scope || submitting.current || (kind === 'DEACTIVATE' && (model.inherited || model.canManage === false || !model.active))) return;
    const fingerprint = `${kind}:${model.id}:${model.version}`;
    if (!requests.current.has(fingerprint)) requests.current.set(fingerprint, crypto.randomUUID());
    mutation.reset();
    setAction({ model: globalThis.structuredClone(model), input: { action: kind, id: model.id,
      expectedVersion: model.version, requestId: requests.current.get(fingerprint)! } });
  };
  const confirmAction = async () => {
    if (!action || submitting.current) return;
    submitting.current = true;
    try {
      const { result } = await mutation.mutateAsync(action.input);
      requests.current.delete(`${action.input.action}:${action.model.id}:${action.model.version}`);
      setAction(null);
      toast.success(action.input.action === 'CLONE' ? 'Modelo clonado' : 'Modelo inativado', result.message);
    } catch { /* Keep the same request for a safe retry; the dialog shows the failure. */ }
    finally { submitting.current = false; }
  };

  return (
    <section className="nfse-panel" aria-label="Modelos de emissão">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="nfse-section-heading">
        <h2>Modelos de emissão</h2>
        <button type="button" className="nfse-button nfse-button-primary" disabled={!scope} onClick={(event) => { event.currentTarget.focus(); setEditor('new'); }}><Plus size={15} />Novo modelo</button>
      </div>
      {models.length ? <div className="nfse-table-wrap">
        <table className="nfse-table">
          <thead><tr><th>Modelo</th><th>Tributação nacional / NBS</th><th>Versão</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{models.map((model) => <tr key={model.id}>
            <td>{model.name}{model.inherited && <small className="nfse-model-origin">Da matriz · {model.sourcePoloName}</small>}<small>{model.serviceDescription}</small></td>
            <td>{model.nationalServiceCode}<small>NBS {model.nbsCode}</small></td>
            <td>{model.version}</td>
            <td><span className="nfse-status" data-tone={model.active ? 'success' : undefined}>{model.active ? 'Ativo' : 'Inativo'}</span></td>
            <td><div className="nfse-model-row-actions">{!model.inherited && model.canManage !== false && <button type="button" className="nfse-button nfse-button-secondary" disabled={mutation.isPending} onClick={(event) => { event.currentTarget.focus(); setEditor(model); }} aria-label={`Editar modelo ${model.name}`}><Pencil size={14} />Editar</button>}
            <button type="button" className="nfse-button nfse-button-secondary" disabled={!scope} aria-label={`Exportar modelo ${model.name}`}
                onClick={event => { event.currentTarget.focus(); if (scope) setExporting({ model: globalThis.structuredClone(model), scope: { ...scope } }); }}><Download size={14} />Exportar</button>
            <NfseModelActionsMenu model={model} disabled={!scope || mutation.isPending} onClone={() => chooseAction(model, 'CLONE')} onDeactivate={() => chooseAction(model, 'DEACTIVATE')} />
            </div>{model.inherited && <small>Gerenciado na matriz</small>}</td>
          </tr>)}</tbody>
        </table>
      </div> : <NfseDataState loading={Boolean(scope && query.isPending)} unavailable={!scope} error={query.error} onRetry={() => void query.refetch()} emptyTitle="Nenhum modelo cadastrado" emptyDescription="" />}
      {editor && <NfseModelForm key={typeof editor === 'string' ? 'new' : editor.id} model={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={(message) => { setEditor(null); toast.success('Modelo salvo', message); }} />}
      {action && <NfseModelActionDialog action={action.input.action} model={action.model} busy={mutation.isPending} failed={Boolean(mutation.error)} onClose={() => { if (!submitting.current) setAction(null); }} onConfirm={() => void confirmAction()} />}
      {exporting && <NfseModelExportModal model={exporting.model} scope={exporting.scope} onClose={() => setExporting(null)} />}
    </section>
  );
};

