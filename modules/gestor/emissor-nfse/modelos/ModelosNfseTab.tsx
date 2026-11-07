import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseModels } from '../hooks/useNfseQueries';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import type { NfseModel } from '../types/nfse.types';
import NfseModelForm from './NfseModelForm';

export default function ModelosNfseTab() {
  const { scope, unavailable, canRead, loading } = useNfseTabContext();
  const query = useNfseModels(canRead ? scope : null);
  const [editor, setEditor] = useState<NfseModel | 'new' | null>(null);
  const { toasts, removeToast, toast } = useToast();
  const models = query.error ? [] : query.data?.rows || [];

  return (
    <section className="nfse-panel" aria-label="Modelos de emissão">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      {editor ? <NfseModelForm key={typeof editor === 'string' ? 'new' : editor.id} model={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={(message) => { setEditor(null); toast.success('Modelo salvo', message); }} /> : <>
        <div className="nfse-section-heading"><div><h2>Modelos de emissão</h2><p>Descrições e parâmetros de serviço próprios deste estabelecimento.</p></div><button type="button" className="nfse-button nfse-button-primary" onClick={() => setEditor('new')}><Plus size={15} />Novo modelo</button></div>
        {models.length ? <div className="nfse-table-wrap"><table className="nfse-table"><thead><tr><th>Modelo</th><th>Serviço nacional</th><th>Versão</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{models.map((model) => <tr key={model.id}><td>{model.name}<small>{model.serviceDescription}</small></td><td>{model.nationalServiceCode}</td><td>{model.version}</td><td><span className="nfse-status" data-tone={model.active ? 'success' : undefined}>{model.active ? 'Ativo' : 'Inativo'}</span></td><td><button type="button" className="nfse-button nfse-button-secondary" onClick={() => setEditor(model)} aria-label={`Editar modelo ${model.name}`}><Pencil size={14} />Editar</button></td></tr>)}</tbody></table></div> : <NfseDataState loading={loading || (canRead && query.isPending)} unavailable={unavailable} error={query.error} onRetry={() => void query.refetch()} emptyTitle="Nenhum modelo cadastrado" emptyDescription="Crie um modelo para padronizar a descrição e os parâmetros de cada serviço." />}
      </>}
    </section>
  );
}
