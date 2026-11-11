import React, { useState } from 'react';
import { Download, Pencil, Plus } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseModels } from '../hooks/useNfseQueries';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import type { NfseModel, NfseScope } from '../types/nfse.types';
import NfseModelForm from './NfseModelForm';
import NfseModelExportModal from './NfseModelExportModal';

export default function NfseEmissionModelsSection() {
  const { scope } = useNfseTabContext();
  const query = useNfseModels(scope);
  const [editor, setEditor] = useState<NfseModel | 'new' | null>(null);
  const [exporting, setExporting] = useState<{ model: NfseModel; scope: NfseScope } | null>(null);
  const { toasts, removeToast, toast } = useToast();
  const models = query.error ? [] : query.data?.rows || [];

  return (
    <section className="nfse-panel" aria-label="Modelos de emissão">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="nfse-section-heading">
        <h2>Modelos de emissão</h2>
        <button type="button" className="nfse-button nfse-button-primary" disabled={!scope} onClick={(event) => { event.currentTarget.focus(); setEditor('new'); }}><Plus size={15} />Novo modelo</button>
      </div>
      {models.length ? <div className="nfse-table-wrap">
        <table className="nfse-table">
          <thead><tr><th>Modelo</th><th>Tributação nacional / NBS</th><th>Versão</th><th>Situação</th><th colSpan={2}>Ações</th></tr></thead>
          <tbody>{models.map((model) => <tr key={model.id}>
            <td>{model.name}<small>{model.serviceDescription}</small></td>
            <td>{model.nationalServiceCode}<small>NBS {model.nbsCode}</small></td>
            <td>{model.version}</td>
            <td><span className="nfse-status" data-tone={model.active ? 'success' : undefined}>{model.active ? 'Ativo' : 'Inativo'}</span></td>
            <td><button type="button" className="nfse-button nfse-button-secondary" onClick={(event) => { event.currentTarget.focus(); setEditor(model); }} aria-label={`Editar modelo ${model.name}`}><Pencil size={14} />Editar</button></td>
            <td><button type="button" className="nfse-button nfse-button-secondary" disabled={!scope} aria-label={`Exportar modelo ${model.name}`}
                onClick={event => { event.currentTarget.focus(); if (scope) setExporting({ model: globalThis.structuredClone(model), scope: { ...scope } }); }}><Download size={14} />Exportar</button></td>
          </tr>)}</tbody>
        </table>
      </div> : <NfseDataState loading={Boolean(scope && query.isPending)} unavailable={!scope} error={query.error} onRetry={() => void query.refetch()} emptyTitle="Nenhum modelo cadastrado" emptyDescription="" />}
      {editor && <NfseModelForm key={typeof editor === 'string' ? 'new' : editor.id} model={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={(message) => { setEditor(null); toast.success('Modelo salvo', message); }} />}
      {exporting && <NfseModelExportModal model={exporting.model} scope={exporting.scope} onClose={() => setExporting(null)} />}
    </section>
  );
}
