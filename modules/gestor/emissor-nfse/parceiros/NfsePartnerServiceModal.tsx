import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { sanitizeCurrencyInput } from '../../../shared/utils/currency-input';
import type { NfseScope } from '../types/nfse.types';
import { useNfseModels } from '../modelos/hooks/useNfseModels';
import { useNfseModelDescriptionPreview } from '../modelos/hooks/useNfseModelDescriptionPreview';
import NfseDescriptionPreview from '../modelos/NfseDescriptionPreview';
import { formatNfseMonth } from '../preparar/nfse-month.presentation';
import { useNfsePartnerServiceOptions, useSaveNfsePartnerService } from './hooks/useNfsePartnerServices';
import { useNfsePartnerServiceDialog } from './hooks/useNfsePartnerServiceDialog';
import NfsePartnerFinancialFields, { type NfsePartnerFinancialMode } from './NfsePartnerFinancialFields';
import { nfsePartnerAmountInput, nfsePartnerInputAmount, nfsePartnerToday } from './nfse-partner-services.presentation';
import type { NfsePartnerServiceInput } from './types/nfse-partner-services.types';
import { useNfseServicePartnerSearch } from './hooks/useNfseServicePartnerSearch';

interface Props { scope: NfseScope; onClose: () => void; onSaved: (message: string) => void }

export default function NfsePartnerServiceModal({ scope, onClose, onSaved }: Props) {
  const titleId = useId();
  const optionsQuery = useNfsePartnerServiceOptions(scope);
  const modelsQuery = useNfseModels(scope);
  const save = useSaveNfsePartnerService(scope);
  const { overlayRef, dialogRef } = useNfsePartnerServiceDialog(onClose, save.isPending);
  const [partnerId, setPartnerId] = useState('');
  const partners = useNfseServicePartnerSearch(scope, partnerId);
  const [modelId, setModelId] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceDate, setServiceDate] = useState(() => {
    const today = nfsePartnerToday();
    return today.startsWith(`${scope.month}-`) ? today : '';
  });
  const [amountInput, setAmountInput] = useState('');
  const [generate, setGenerate] = useState(false);
  const [mode, setMode] = useState<NfsePartnerFinancialMode>('');
  const [existingId, setExistingId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const options = optionsQuery.error ? undefined : optionsQuery.data;
  const models = modelsQuery.error ? [] : modelsQuery.data?.rows || [];
  const selectedModel = models.find((model) => model.active && model.id === modelId);
  const selectedPartner = partners.rows.find((partner) => partner.id === partnerId);
  const receivables = options?.existingReceivables.filter((item) => item.partnerId === partnerId) || [];
  const linked = generate && mode === 'LINK';
  const selectedReceivable = linked ? receivables.find((item) => item.id === existingId) : undefined;
  const amount = linked ? selectedReceivable?.amount || '' : nfsePartnerInputAmount(amountInput);
  const hasVariable = /\{\{|\}\}/.test(serviceDescription);
  const preview = useNfseModelDescriptionPreview(scope, hasVariable ? '' : serviceDescription);
  const currentMonthDate = Boolean(serviceDate && serviceDate.startsWith(`${scope.month}-`));
  const financeReady = !generate || Boolean(options?.capabilities.canGenerateReceivable
    && (mode === 'LINK' ? selectedReceivable : mode === 'CREATE' && dueDate && options.categories.some((item) => item.id === categoryId)));
  const canSave = Boolean(selectedPartner && selectedModel && preview.ready && !hasVariable && currentMonthDate
    && /^(0|[1-9]\d*)\.\d{2}$/.test(amount) && amount !== '0.00' && financeReady
    && !optionsQuery.isFetching && !modelsQuery.isFetching && !save.isPending);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave || !selectedModel) return;
    const fields: Omit<NfsePartnerServiceInput, 'requestId'> = {
      partnerId, modelId, modelVersion: selectedModel.version, serviceDate, serviceDescription: serviceDescription.trim(), amount,
      generateReceivable: generate, existingReceivableId: linked ? existingId : null,
      dueDate: generate && mode === 'CREATE' ? dueDate : null,
      categoryId: generate && mode === 'CREATE' ? categoryId : null,
    };
    const fingerprint = JSON.stringify({ scope, fields });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const { result } = await save.mutateAsync({ ...fields, requestId: request.current.id });
      onSaved(result.receivableAction === 'CREATED' ? 'Serviço salvo e conta a receber criada.'
        : result.receivableAction === 'LINKED' ? 'Serviço salvo e conta a receber vinculada.' : 'Serviço adicionado à preparação.');
    } catch { /* Keep the request ID for a safe retry. */ }
  };
  const submitLabel = generate ? (mode === 'LINK' ? 'Salvar e vincular conta' : 'Salvar e gerar conta') : 'Adicionar serviço';

  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-partner-modal-overlay" role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget && !save.isPending) onClose(); }}>
    <form ref={dialogRef} className="nfse-partner-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={save.isPending} tabIndex={-1} onSubmit={(event) => void submit(event)}>
      <header className="nfse-section-heading"><div><h2 id={titleId}>Adicionar serviço</h2><p>{formatNfseMonth(scope.month)}</p></div>
        <button type="button" className="nfse-button nfse-button-secondary" disabled={save.isPending} aria-label="Fechar serviço" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="nfse-partner-modal-body">
        <fieldset disabled={save.isPending} className="nfse-partner-fieldset">
          <section className="nfse-partner-form-section nfse-partner-form-grid">
            <div className="nfse-field nfse-wide"><label htmlFor="nfse-service-partner">Aluno ou parceiro</label>
              <input type="search" aria-label="Buscar aluno ou parceiro" maxLength={100} placeholder="Pesquisar por nome, CPF ou CNPJ (mínimo 2 caracteres)"
                onChange={event => partners.search(event.target.value)} />
              <InstitutionalSelect id="nfse-service-partner" ariaLabel="Aluno ou parceiro" required value={partnerId}
                options={partners.rows.map((partner) => ({ value: partner.id, label: `${partner.tradeName || partner.name} · ${partner.document || partner.type}`, keywords: `${partner.name} ${partner.tradeName || ''} ${partner.document || ''}` }))}
                loading={partners.loading} error={partners.error ? 'Não foi possível consultar os parceiros.' : undefined}
                placeholder="Buscar nome, CPF ou CNPJ" onValueChange={(value) => { setPartnerId(value); setExistingId(''); }} />
              {partners.error && <button type="button" className="nfse-button nfse-button-secondary" onClick={partners.retry}>Consultar parceiros novamente</button>}
            </div>
            <div className="nfse-field nfse-wide"><label htmlFor="nfse-service-model">Modelo de emissão</label>
              <InstitutionalSelect id="nfse-service-model" ariaLabel="Modelo de emissão" required value={modelId}
                options={models.filter((model) => model.active).map((model) => ({ value: model.id, label: model.name }))}
                loading={modelsQuery.isPending} error={modelsQuery.error ? 'Não foi possível consultar os modelos.' : undefined}
                onValueChange={(value) => { setModelId(value); setServiceDescription(models.find((model) => model.id === value)?.serviceDescription || ''); }} />
            </div>
            {(optionsQuery.error || modelsQuery.error) && <div className="nfse-partner-error nfse-wide" role="alert"><span>Não foi possível carregar as opções.</span><button type="button" className="nfse-button nfse-button-secondary" onClick={() => { void optionsQuery.refetch(); void modelsQuery.refetch(); }}>Tentar novamente</button></div>}
            <label className="nfse-field"><span>Data da prestação</span><input type="date" required value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
            <label className="nfse-field"><span>Valor do serviço</span><input inputMode="decimal" required placeholder="0,00" value={linked ? selectedReceivable ? nfsePartnerAmountInput(selectedReceivable.amount) : '' : amountInput}
              readOnly={linked} onChange={(event) => setAmountInput(sanitizeCurrencyInput(event.target.value, amountInput))} /></label>
            {serviceDate && !currentMonthDate && <small className="nfse-partner-error nfse-wide" role="alert">Escolha uma data em {formatNfseMonth(scope.month)}.</small>}
            <label className="nfse-field nfse-wide"><span>Descrição do serviço</span><textarea required maxLength={2000} value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} /></label>
            {hasVariable ? <small className="nfse-partner-error nfse-wide" role="alert">Informe a descrição final deste serviço, sem variáveis de recebimentos.</small>
              : <div className="nfse-wide"><NfseDescriptionPreview preview={preview} /></div>}
          </section>
          <NfsePartnerFinancialFields generate={generate} onGenerate={(value) => { setGenerate(value); if (!value) { setMode(''); setExistingId(''); } }}
            mode={mode} onMode={(value) => { setMode(value); setExistingId(''); }} existingId={existingId} onExistingId={setExistingId}
            dueDate={dueDate} onDueDate={setDueDate} categoryId={categoryId} onCategoryId={setCategoryId} options={options} receivables={receivables} />
        </fieldset>
        {save.error && <div className="nfse-partner-error nfse-partner-form-section" role="alert"><span>{save.error.message}</span>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={optionsQuery.isFetching || modelsQuery.isFetching}
            onClick={() => { void optionsQuery.refetch(); void modelsQuery.refetch(); }}>Atualizar opções</button>
        </div>}
      </div>
      <footer className="nfse-footer"><button type="button" className="nfse-button nfse-button-secondary" disabled={save.isPending} onClick={onClose}>Cancelar</button>
        <button type="submit" className="nfse-button nfse-button-primary" disabled={!canSave}><Save size={15} />{save.isPending ? 'Salvando…' : submitLabel}</button>
      </footer>
    </form>
  </div>, document.body);
}
