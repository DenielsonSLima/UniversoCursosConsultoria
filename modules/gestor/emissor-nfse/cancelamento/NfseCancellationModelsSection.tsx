import { useState } from 'react';
import { Copy, Pencil, Plus, RefreshCw } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import { cancellationCategories, cancellationReasons, type NfseCancellationModel, type NfseCancellationModelsService } from './nfse-cancellation-models.contract';
import { useNfseCancellationModels } from './nfse-cancellation-models.queries';
import NfseCancellationModelEditor from './NfseCancellationModelEditor';
import './nfse-cancellation-models.css';
export default function NfseCancellationModelsSection({ service }: { service?: NfseCancellationModelsService }) {
  const { scope } = useNfseTabContext(), query = useNfseCancellationModels(scope, service);
  const [category, setCategory] = useState(''), [editor, setEditor] = useState<{ model?: NfseCancellationModel; copy?: boolean } | null>(null);
  const { toasts, removeToast, toast } = useToast();
  const rows = query.error ? [] : (query.data || []).filter(model => !category || model.category === category);
  return <section className="nfse-panel" aria-label="Modelos de cancelamento"><ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="nfse-section-heading"><h2>Justificativas de cancelamento</h2><div className="nfse-queue-actions">
      <button type="button" className="nfse-button nfse-button-secondary" disabled={query.isFetching || !scope} onClick={() => void query.refetch()}><RefreshCw size={15} />Atualizar</button>
      <button type="button" className="nfse-button nfse-button-primary" disabled={!scope} onClick={() => setEditor({})}><Plus size={15} />Novo modelo</button></div></header>
    <div className="nfse-toolbar"><div className="nfse-field"><label>Categoria</label><InstitutionalSelect ariaLabel="Filtrar modelos de cancelamento por categoria" value={category}
      options={[{ value: '', label: 'Todas as categorias' }, ...cancellationCategories]} onValueChange={value => { if (!value || cancellationCategories.some(item => item.value === value)) setCategory(value); }} /></div>
      <p className="nfse-inline-help">Padrões formais podem ser copiados. O texto final exige fatos verdadeiros e confirmação por nota.</p></div>
    {rows.length ? <div className="nfse-table-wrap"><table className="nfse-table"><thead><tr><th>Modelo / categoria</th><th>Motivo fiscal</th><th>Texto reutilizável</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>{rows.map(model => <tr key={model.id}><td>{model.name}<small>{cancellationCategories.find(item => item.value === model.category)?.label} · versão {model.version}</small></td>
        <td>{cancellationReasons.find(item => item.value === model.reasonCode)?.label}</td><td className="nfse-cancel-model-text">{model.textTemplate}</td>
        <td><span className="nfse-status" data-tone={model.active ? 'success' : undefined}>{model.active ? 'Ativo' : 'Inativo'}</span><small>{model.source === 'SYSTEM' ? 'Padrão do sistema' : 'Personalizado'}</small></td>
        <td><button type="button" className="nfse-button nfse-button-secondary" onClick={() => setEditor({ model, copy: model.source === 'SYSTEM' })}>
          {model.source === 'SYSTEM' ? <Copy size={15} /> : <Pencil size={15} />}{model.source === 'SYSTEM' ? 'Usar como base' : 'Editar'}</button></td></tr>)}</tbody></table></div>
      : <NfseDataState loading={query.isPending && Boolean(scope)} unavailable={!scope} error={query.error} onRetry={() => void query.refetch()}
        emptyTitle="Nenhum modelo nesta categoria" emptyDescription="Cadastre um texto formal para reutilizar no cancelamento." />}
    {editor && scope && <NfseCancellationModelEditor scope={scope} model={editor.model} copy={editor.copy} service={service} onClose={() => setEditor(null)} onSaved={model => {
      setEditor(null); toast.success('Modelo de cancelamento salvo', `${model.name} · versão ${model.version}. Nenhuma nota foi cancelada.`);
    }} />}
  </section>;
}
