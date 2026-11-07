import React, { useRef, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useSaveNfseModel } from '../hooks/useNfseMutations';
import { NFSE_WRITES_ENABLED } from '../services/nfse.runtime';
import { useNfseTabContext } from '../components/NfseTabContext';
import type { NfseModel } from '../types/nfse.types';

interface NfseModelFormProps {
  model?: NfseModel; onClose: () => void; onSaved: (message: string) => void;
}

const NfseModelForm: React.FC<NfseModelFormProps> = ({ model, onClose, onSaved }) => {
  const { scope, workspace, canRead } = useNfseTabContext();
  const [name, setName] = useState(model?.name || '');
  const [serviceDescription, setDescription] = useState(model?.serviceDescription || '');
  const [nationalServiceCode, setCode] = useState(model?.nationalServiceCode || '');
  const [active, setActive] = useState(model?.active ?? true);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const save = useSaveNfseModel(scope, workspace?.capabilities);
  const allowed = Boolean(NFSE_WRITES_ENABLED && canRead && workspace?.capabilities.manageModels);
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

  return (
    <form onSubmit={(event) => void submit(event)} aria-label={model ? 'Editar modelo de NFS-e' : 'Novo modelo de NFS-e'}>
      <div className="nfse-section-heading"><div><h2>{model ? 'Editar modelo' : 'Novo modelo'}</h2><p>{model ? `Versão ${model.version}. Alterações serão salvas em uma nova versão.` : 'Defina a descrição e a identificação do serviço para este estabelecimento.'}</p></div><button type="button" className="nfse-button nfse-button-secondary" onClick={onClose} disabled={save.isPending} aria-label="Fechar formulário do modelo"><X size={16} /></button></div>
      <fieldset className="nfse-model-form" disabled={save.isPending}>
        <label className="nfse-field"><span>Nome do modelo</span><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Mensalidade de curso técnico" /></label>
        <label className="nfse-field"><span>Código de tributação nacional</span><input required maxLength={20} value={nationalServiceCode} onChange={(event) => setCode(event.target.value)} placeholder="Código validado para o serviço" /></label>
        <label className="nfse-field nfse-wide"><span>Descrição do serviço</span><textarea required maxLength={2000} value={serviceDescription} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição que será utilizada na preparação da nota" /></label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Modelo ativo</label>
        <p className="nfse-inline-help nfse-wide">Os valores virão dos recebimentos selecionados. O modelo deve corresponder ao serviço e ao enquadramento fiscal deste polo.</p>
      </fieldset>
      {save.error && <div className="nfse-notice" role="alert">Não foi possível confirmar o salvamento do modelo. Revise a disponibilidade antes de tentar novamente.</div>}
      <div className="nfse-footer"><span>{allowed ? 'O modelo ficará disponível após a confirmação do salvamento.' : 'O salvamento será liberado quando a integração deste estabelecimento estiver habilitada.'}</span><button type="submit" className="nfse-button nfse-button-primary" disabled={!allowed || save.isPending}><Save size={15} />{save.isPending ? 'Salvando…' : 'Salvar modelo'}</button></div>
    </form>
  );
};

export default NfseModelForm;
