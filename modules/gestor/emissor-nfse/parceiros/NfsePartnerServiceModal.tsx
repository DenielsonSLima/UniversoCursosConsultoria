import { nfseModelsForType } from '../modelos/nfse-model-type';
import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Save, X } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { currencyInputToCents, formatCentsAsCurrencyInput, formatCurrencyInput, sanitizeCurrencyInput } from '../../../shared/utils/currency-input';
import type { NfseScope } from '../types/nfse.types';
import { useNfseModels } from '../modelos/hooks/useNfseModels';
import { useNfseFiscalCatalogs } from '../modelos/hooks/useNfseFiscalCatalogs';
import type { NfseFiscalCatalogOption } from '../modelos/catalogos/nfse-fiscal-catalogs.types';
import { useNfseModelDescriptionPreview } from '../modelos/hooks/useNfseModelDescriptionPreview';
import NfseDescriptionPreview from '../modelos/NfseDescriptionPreview';
import { formatNfseMonth } from '../preparar/nfse-month.presentation';
import { useNfsePartnerServiceOptions, useSaveNfsePartnerService } from './hooks/useNfsePartnerServices';
import { useNfsePartnerServiceDialog } from './hooks/useNfsePartnerServiceDialog';
import NfsePartnerFinancialFields, { type NfsePartnerFinancialMode } from './NfsePartnerFinancialFields';
import { nfsePartnerAmountInput, nfsePartnerInputAmount, nfsePartnerToday } from './nfse-partner-services.presentation';
import type { NfsePartnerServiceInput } from './types/nfse-partner-services.types';
import { useNfseServicePartnerSearch } from './hooks/useNfseServicePartnerSearch';

import { NFSE_SERVICE_PERIOD_TOKEN, nfseServicePeriodPreview } from './nfse-service-period';
import { useNfsePartnerFinancialPlan } from './hooks/useNfsePartnerFinancialPlan';
import NfseServicePlanPreview from './NfseServicePlanPreview';
import { formatNfseMoney } from '../components/nfse.presentation';

interface Props { scope: NfseScope; onClose: () => void; onSaved: (message: string) => void }

function describeFiscalCode(code: string, options: readonly NfseFiscalCatalogOption[] | undefined, loading: boolean) {
  if (!code) return 'Não informado no modelo';
  const description = options?.find((option) => option.code === code)?.description;
  return `${code} · ${description || (loading ? 'Carregando descrição…' : 'Descrição indisponível no catálogo')}`;
}

function withFinalPeriod(text: string) {
  const summary = text.trimEnd();
  return summary.endsWith('.') ? summary : `${summary}.`;
}

export default function NfsePartnerServiceModal({ scope, onClose, onSaved }: Props) {
  const titleId = useId();
  const optionsQuery = useNfsePartnerServiceOptions(scope);
  const modelsQuery = useNfseModels(scope);
  const catalogs = useNfseFiscalCatalogs();
  const save = useSaveNfsePartnerService(scope);
  const [partnerId, setPartnerId] = useState('');
  const partners = useNfseServicePartnerSearch(scope, partnerId);
  const [modelId, setModelId] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [servicePeriodStart, setServicePeriodStart] = useState('');
  const [servicePeriodEnd, setServicePeriodEnd] = useState('');
  const [serviceDate, setServiceDate] = useState(() => {
    const today = nfsePartnerToday();
    return today.startsWith(`${scope.month}-`) ? today : '';
  });
  const [amountInput, setAmountInput] = useState('');
  const [mode, setMode] = useState<NfsePartnerFinancialMode>('CREATE');
  const [existingId, setExistingId] = useState('');
  const [step, setStep] = useState(0);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const options = optionsQuery.error ? undefined : optionsQuery.data;
  const models = modelsQuery.error ? [] : nfseModelsForType(modelsQuery.data?.rows || [], 'SERVICO');
  const selectedModel = models.find((model) => model.active && model.id === modelId);
  const selectedPartner = partners.rows.find((partner) => partner.id === partnerId);
  const partnerLabel = (partner: NonNullable<typeof selectedPartner>) => `${partner.tradeName || partner.name} · ${partner.document || partner.type}`;
  const receivables = options?.existingReceivables.filter((item) => item.partnerId === partnerId) || [];
  const linked = mode === 'LINK';
  const selectedReceivable = linked ? receivables.find((item) => item.id === existingId) : undefined;
  const amount = linked ? selectedReceivable?.amount || '' : nfsePartnerInputAmount(amountInput);
  const period = nfseServicePeriodPreview(serviceDescription, servicePeriodStart, servicePeriodEnd);
  const serviceCategories = options?.categories.filter((item) => item.name.trim().toLocaleUpperCase('pt-BR') === 'SERVIÇOS NFS-E') || [];
  const category = serviceCategories.length === 1 ? serviceCategories[0] : undefined;
  const finance = useNfsePartnerFinancialPlan(scope, partnerId, amount, period.text, category?.id || '');
  const busy = save.isPending || finance.preview.isPending;
  const { overlayRef, dialogRef } = useNfsePartnerServiceDialog(onClose, busy);
  const advancing = useRef(false);
  const requiresPeriod = period.requiresPeriod || Boolean(selectedModel?.serviceDescription.includes(NFSE_SERVICE_PERIOD_TOKEN));
  const periodReady = !requiresPeriod || period.valid;
  const preview = useNfseModelDescriptionPreview(scope, period.unknownVariables || !periodReady || period.tooLong ? '' : period.text);
  const currentMonthDate = Boolean(serviceDate && serviceDate.startsWith(`${scope.month}-`));
  const financeReady = Boolean(options?.capabilities.canGenerateReceivable
    && (linked ? options.capabilities.canLinkExistingReceivable && selectedReceivable
      : finance.ready && options.categories.some((item) => item.id === finance.input.categoryId)
        && (!finance.input.issueBolePix || options.capabilities.canIssueBolePix)));
  const detailsReady = Boolean(selectedPartner && selectedModel && preview.ready && !period.unknownVariables && periodReady && !period.tooLong && currentMonthDate
    && /^(0|[1-9]\d*)\.\d{2}$/.test(amount) && amount !== '0.00'
    && !optionsQuery.isFetching && !modelsQuery.isFetching && !partners.loading && !partners.error);
  const canSave = detailsReady && financeReady && (linked || Boolean(finance.current)) && !busy && step === 2;
  const next = async () => {
    if (busy || advancing.current || !detailsReady) return;
    if (step === 0) { setStep(1); return; }
    if (step === 1 && financeReady) {
      advancing.current = true;
      try { if (!linked) await finance.prepare(); setStep(2); } catch { /* Keep the form and display the canonical error. */ }
      finally { advancing.current = false; }
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step !== 2) { await next(); return; }
    if (!canSave || !selectedModel) return;
    const fields: Omit<NfsePartnerServiceInput, 'requestId'> = {
      partnerId, modelId, modelVersion: selectedModel.version, serviceDate, serviceDescription: serviceDescription.trim(), amount,
      ...(requiresPeriod ? { servicePeriodStart, servicePeriodEnd } : {}),
      generateReceivable: true, existingReceivableId: linked ? existingId : null,
      dueDate: !linked ? finance.current!.financialPlan.firstDueDate : null,
      categoryId: !linked ? finance.current!.financialPlan.categoryId : null,
      ...(!linked ? { financialPlan: finance.current!.financialPlan } : {}),
    };
    const fingerprint = JSON.stringify({ scope, fields });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const { result } = await save.mutateAsync({ ...fields, requestId: request.current.id });
      onSaved(result.receivableAction === 'LINKED' ? 'Serviço salvo com a conta existente selecionada. O vínculo fiscal será confirmado após a autorização.'
        : `Serviço salvo. Os recebíveis serão gerados após a NFS-e ser autorizada, em Financeiro > A Receber > Serviços.${finance.current?.financialPlan.issueBolePix ? ' O BolePix será processado automaticamente depois da autorização.' : ''}`);
    } catch { /* Keep the request ID for a safe retry. */ }
  };
  const submitLabel = 'Confirmar serviço';

  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-partner-modal-overlay" role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form ref={dialogRef} className="nfse-partner-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1} onSubmit={(event) => void submit(event)}>
      <header className="nfse-section-heading"><div><h2 id={titleId}>Adicionar serviço</h2><p>{formatNfseMonth(scope.month)}</p></div>
        <button type="button" className="nfse-button nfse-button-secondary" disabled={busy} aria-label="Fechar serviço" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="nfse-partner-modal-body">
        <ol aria-label="Etapas do serviço" className="mb-4 flex flex-wrap gap-3 text-xs text-slate-500">{['Dados do serviço', 'Financeiro', 'Revisão'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step === index ? 'font-medium text-[#001a33]' : ''}>{index + 1}. {label}</li>)}</ol>
        <fieldset hidden={step !== 0} disabled={busy || step !== 0} className="nfse-partner-fieldset">
          <section className="nfse-partner-form-section nfse-partner-form-grid">
            <div className="nfse-field nfse-wide"><label htmlFor="nfse-service-partner">Aluno ou parceiro</label>
              <InstitutionalSelect id="nfse-service-partner" ariaLabel="Aluno ou parceiro" required value={partnerId}
                options={partners.options.map((partner) => ({ value: partner.id, label: partnerLabel(partner) }))}
                remoteSearch={{ onSearchChange: partners.search, selectedLabel: selectedPartner ? partnerLabel(selectedPartner) : undefined, minLength: 2, maxLength: 100 }}
                loading={partners.loading} error={partners.error ? 'Não foi possível consultar os parceiros.' : undefined}
                placeholder="Buscar nome, CPF ou CNPJ" onValueChange={(value) => { setPartnerId(value); setExistingId(''); }} />
              {partners.error && <button type="button" className="nfse-button nfse-button-secondary" onClick={partners.retry}>Consultar parceiros novamente</button>}
            </div>
            <div className="nfse-field nfse-wide"><label htmlFor="nfse-service-model">Modelo de emissão</label>
              <InstitutionalSelect id="nfse-service-model" ariaLabel="Modelo de emissão" placeholder="Selecionar modelo de serviços" required value={modelId} showOptionDescriptions
                options={models.filter((model) => model.active).map((model) => ({ value: model.id, label: model.name,
                  description: withFinalPeriod(`NBS ${describeFiscalCode(model.nbsCode, catalogs.data?.nbs, catalogs.isPending)} | Operação ${describeFiscalCode(model.operationIndicatorCode, catalogs.data?.operationIndicators, catalogs.isPending)}`),
                }))}
                loading={modelsQuery.isPending} error={modelsQuery.error ? 'Não foi possível consultar os modelos.' : undefined}
                onValueChange={(value) => { setModelId(value); setServicePeriodStart(''); setServicePeriodEnd(''); setServiceDescription(models.find((model) => model.id === value)?.serviceDescription || ''); }} />
            </div>
            {!modelsQuery.isPending && !modelsQuery.error && !models.length && <p className="nfse-inline-help nfse-wide">Nenhum modelo ativo do tipo Serviços. Defina o tipo em Modelos antes de emitir.</p>}
            {(optionsQuery.error || modelsQuery.error) && <div className="nfse-partner-error nfse-wide" role="alert"><span>Não foi possível carregar as opções.</span><button type="button" className="nfse-button nfse-button-secondary" onClick={() => { void optionsQuery.refetch(); void modelsQuery.refetch(); }}>Tentar novamente</button></div>}
            <label className="nfse-field"><span>Data da prestação</span><input type="date" required value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
            <label className="nfse-field"><span>Valor do serviço</span><input inputMode="decimal" required placeholder="0,00" value={linked ? selectedReceivable ? nfsePartnerAmountInput(selectedReceivable.amount) : '' : amountInput}
              readOnly={linked} onChange={(event) => setAmountInput(sanitizeCurrencyInput(event.target.value, amountInput))}
              onBlur={() => { if (!linked) setAmountInput(formatCurrencyInput(amountInput)); }}
              onPaste={(event) => {
                if (linked) return;
                event.preventDefault();
                const text = event.clipboardData.getData('text').trim().replace(/^(?:R\$|\$)\s*/, '');
                const cents = currencyInputToCents(text);
                if (cents !== null) setAmountInput(/[.,]/.test(text) ? formatCentsAsCurrencyInput(cents) : sanitizeCurrencyInput(text, amountInput));
              }} /></label>
            {serviceDate && !currentMonthDate && <small className="nfse-partner-error nfse-wide" role="alert">Escolha uma data em {formatNfseMonth(scope.month)}.</small>}
            <label className="nfse-field nfse-wide"><span>Descrição do serviço</span><textarea required maxLength={2000} value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} /></label>
            {requiresPeriod && <>
              <label className="nfse-field"><span>Início do período do serviço</span><input type="date" required value={servicePeriodStart} onChange={event => setServicePeriodStart(event.target.value)} /></label>
              <label className="nfse-field"><span>Fim do período do serviço</span><input type="date" required min={servicePeriodStart || undefined} value={servicePeriodEnd} onChange={event => setServicePeriodEnd(event.target.value)} /></label>
              <small className="nfse-wide">Preenche a variável de período na descrição desta nota. Não altera a data da prestação nem a competência fiscal.</small>
              {!period.valid && <small className="nfse-partner-error nfse-wide" role="alert">{period.error}</small>}
            </>}
            {period.tooLong && <small className="nfse-partner-error nfse-wide" role="alert">A descrição com o período excede 2.000 caracteres. Reduza o texto.</small>}
            {period.unknownVariables ? <small className="nfse-partner-error nfse-wide" role="alert">Neste serviço, use somente a variável {'{{periodo}}'}. As variáveis acadêmicas são exclusivas de alunos.</small>
              : <div className="nfse-wide"><NfseDescriptionPreview preview={preview} /></div>}
          </section>
        </fieldset>
        <fieldset hidden={step !== 1} disabled={busy || step !== 1} className="nfse-partner-fieldset">
          <NfsePartnerFinancialFields mode={mode} onMode={(value) => { setMode(value); setExistingId(''); }} existingId={existingId} onExistingId={setExistingId}
            form={finance.form} onChange={finance.change} options={options} receivables={receivables} />
          {!linked && options && !category && <p role="alert" className="nfse-partner-error nfse-partner-form-section">A categoria SERVIÇOS NFS-E está indisponível. Atualize as opções antes de continuar.</p>}
        </fieldset>
        {step === 2 && <>
          <section className="nfse-partner-form-section text-sm"><p><strong>{selectedPartner ? partnerLabel(selectedPartner) : ''}</strong></p><p>{selectedModel?.name} · {formatNfseMoney(amount)}</p><p>{period.text}</p>
            <p className="nfse-inline-help mt-3">{linked ? 'Conta existente selecionada para vínculo fiscal após a autorização.' : finance.current?.financialPlan.issueBolePix ? 'Recebíveis e BolePix após a NFS-e ser autorizada.' : 'Somente contas a receber, após a NFS-e ser autorizada.'}</p></section>
          {!linked && finance.current && <NfseServicePlanPreview preview={finance.current.preview} />}
          {linked && selectedReceivable && <p className="nfse-partner-form-section text-sm">{selectedReceivable.description} · {formatNfseMoney(selectedReceivable.amount)}</p>}
        </>}
        {finance.preview.error && <p role="alert" className="nfse-partner-error nfse-partner-form-section">{finance.preview.error.message}</p>}
        {save.error && <div className="nfse-partner-error nfse-partner-form-section" role="alert"><span>{save.error.message}</span>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={optionsQuery.isFetching || modelsQuery.isFetching}
            onClick={() => { void optionsQuery.refetch(); void modelsQuery.refetch(); }}>Atualizar opções</button>
        </div>}
      </div>
      <footer className="nfse-footer"><button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <div className="flex gap-2">{step > 0 && <button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={() => setStep(value => value - 1)}><ArrowLeft size={15} />Voltar</button>}
          {step < 2 ? <button type="button" className="nfse-button nfse-button-primary" disabled={busy || !detailsReady || (step === 1 && !financeReady)} onClick={() => void next()}><ArrowRight size={15} />{finance.preview.isPending ? 'Conferindo parcelas…' : step === 0 ? 'Financeiro' : 'Revisar'}</button>
            : <button type="submit" className="nfse-button nfse-button-primary" disabled={!canSave}><Save size={15} />{save.isPending ? 'Salvando…' : submitLabel}</button>}</div>
      </footer>
    </form>
  </div>, document.body);
}
