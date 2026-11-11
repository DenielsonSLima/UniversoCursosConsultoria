import { useState } from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import type { NfseScope } from '../types/nfse.types';
import { cancellationCategories, type NfseCancellationModel, type NfseCancellationModelsService } from './nfse-cancellation-models.contract';
import { useNfseCancellationModels } from './nfse-cancellation-models.queries';
interface Props { scope: NfseScope; disabled: boolean; onApply: (model: NfseCancellationModel) => void; service?: NfseCancellationModelsService }
export default function NfseCancellationTemplatePicker({ scope, disabled, onApply, service }: Props) {
  const query = useNfseCancellationModels(scope, service), [selectedId, setSelectedId] = useState('');
  const rows = query.error ? [] : (query.data || []).filter(model => model.active);
  const selected = rows.find(model => model.id === selectedId);
  const usable = Boolean(selected);
  return <div className="nfse-cancel-template-picker"><div className="nfse-field"><label>Modelo de justificativa</label><InstitutionalSelect ariaLabel="Modelo de justificativa para cancelar" value={selectedId} disabled={disabled}
    loading={query.isFetching} error={query.error ? 'Não foi possível consultar os modelos de justificativa.' : undefined}
    options={rows.map(model => ({ value: model.id, label: `${model.name} · ${cancellationCategories.find(item => item.value === model.category)?.label} · v${model.version}` }))}
    onValueChange={value => { if (rows.some(model => model.id === value)) setSelectedId(value); }} /></div>
    <button type="button" className="nfse-button nfse-button-secondary" disabled={disabled || !usable} onClick={() => { if (selected && usable) onApply(selected); }}>Usar modelo selecionado</button>
    <p className="nfse-inline-help">Complete {'{{detalhe}}'} com os fatos desta nota e confira o texto final que será validado pelo servidor.</p>
    {query.error && <button type="button" className="nfse-button nfse-button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Consultar modelos novamente</button>}
  </div>;
}
