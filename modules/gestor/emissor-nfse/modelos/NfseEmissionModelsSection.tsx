import React, { useRef, useState } from 'react';
import { Download, Pencil, Plus } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import type { NfseModel, NfseModelActionInput, NfseScope } from '../types/nfse.types';
import NfseModelForm from './NfseModelForm';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { nfseModelTypeLabel, nfseModelTypeOptions } from './nfse-model-type';
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
  const [modelType, setModelType] = useState('');
  const [editor, setEditor] = useState<NfseModel | 'new' | null>(null);
  const [exporting, setExporting] = useState<{ model: NfseModel; scope: NfseScope } | null>(null);
  const { toasts, removeToast, toast } = useToast();
  const models = query.error ? [] : query.data?.rows || [];
  const visibleModels = models.filter(model => !modelType || (modelType === 'UNCLASSIFIED' ? !model.modelType : (model.modelType === modelType || (modelType !== 'AMBOS' && model.modelType === 'AMBOS'))));
  const canManage = Boolean(scope && !query.error && query.data?.canManage);
  const canManageModel = (model: NfseModel) => canManage && model.canManage === true && !model.inherited;
  const mutation = useMutateNfseModel(scope);
  const [action, setAction] = useState<{ model: NfseModel; input: NfseModelActionInput } | null>(null);
  const requests = useRef(new Map<string, string>());
  const submitting = useRef(false);
  const chooseAction = (model: NfseModel, kind: NfseModelActionInput['action']) => {
    if (!scope || !canManageModel(model) || submitting.current || (kind === 'DEACTIVATE' && !model.active)) return;
    const fingerprint = `${kind}:${model.id}:${model.version}`;
    if (!requests.current.has(fingerprint)) requests.current.set(fingerprint, crypto.randomUUID());
    mutation.reset();
    setAction({ model: globalThis.structuredClone(model), input: { action: kind, id: model.id,
      expectedVersion: model.version, requestId: requests.current.get(fingerprint)! } });
  };
  const confirmAction = async () => {
    if (!action || !canManageModel(action.model) || submitting.current) return;
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
        {canManage && <button type="button" className="nfse-button nfse-button-primary" onClick={(event) => { event.currentTarget.focus(); setEditor('new'); }}><Plus size={15} />Novo modelo</button>}
      </div>
      {scope && !query.isPending && !query.error && !canManage && <p className="nfse-inline-help">Os modelos de emissão são gerenciados na matriz e compartilhados com as filiais para uso na emissão.</p>}
      <InstitutionalSelect id="nfse-model-type-filter" ariaLabel="Filtrar tipo do modelo" value={modelType}
        onValueChange={setModelType} options={[{ value: '', label: 'Todos os tipos' }, ...nfseModelTypeOptions, { value: 'UNCLASSIFIED', label: 'Tipo não definido' }]} />
      {visibleModels.length ? <div className="nfse-table-wrap">
        <table className="nfse-table">
          <thead><tr><th>Modelo</th><th>Tipo</th><th>Tributação nacional / NBS</th><th>Versão</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{visibleModels.map((model) => <tr key={model.id}>
            <td>{model.name}{model.inherited && <small className="nfse-model-origin">Da matriz · {model.sourcePoloName}</small>}<small>{model.serviceDescription}</small></td>
            <td>{nfseModelTypeLabel(model.modelType)}</td>
            <td>{model.nationalServiceCode}<small>NBS {model.nbsCode}</small></td>
            <td>{model.version}</td>
            <td><span className="nfse-status" data-tone={model.active ? 'success' : undefined}>{model.active ? 'Ativo' : 'Inativo'}</span></td>
            <td><div className="nfse-model-row-actions">{canManageModel(model) && <button type="button" className="nfse-button nfse-button-secondary" disabled={mutation.isPending} onClick={(event) => { event.currentTarget.focus(); setEditor(model); }} aria-label={`Editar modelo ${model.name}`}><Pencil size={14} />Editar</button>}
            <button type="button" className="nfse-button nfse-button-secondary" disabled={!scope} aria-label={`Exportar modelo ${model.name}`}
                onClick={event => { event.currentTarget.focus(); if (scope) setExporting({ model: globalThis.structuredClone(model), scope: { ...scope } }); }}><Download size={14} />Exportar</button>
            {canManageModel(model) && <NfseModelActionsMenu model={model} disabled={mutation.isPending} onClone={() => chooseAction(model, 'CLONE')} onDeactivate={() => chooseAction(model, 'DEACTIVATE')} />}
            </div>{model.inherited && <small>Gerenciado na matriz</small>}</td>
          </tr>)}</tbody>
        </table>
      </div> : <NfseDataState loading={Boolean(scope && query.isPending)} unavailable={!scope} error={query.error} onRetry={() => void query.refetch()} emptyTitle="Nenhum modelo neste filtro" emptyDescription="" />}
      {canManage && editor && <NfseModelForm key={typeof editor === 'string' ? 'new' : editor.id} model={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={(message) => { setEditor(null); toast.success('Modelo salvo', message); }} />}
      {canManage && action && <NfseModelActionDialog action={action.input.action} model={action.model} busy={mutation.isPending} failed={Boolean(mutation.error)} onClose={() => { if (!submitting.current) setAction(null); }} onConfirm={() => void confirmAction()} />}
      {exporting && <NfseModelExportModal model={exporting.model} scope={exporting.scope} onClose={() => setExporting(null)} />}
    </section>
  );
};

