import React from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { formatNfseMoney } from '../components/nfse.presentation';
import type { NfseExistingReceivable, NfsePartnerServiceOptions } from './types/nfse-partner-services.types';
import { nfsePartnerDate } from './nfse-partner-services.presentation';
import type { NfseServicePlanForm } from './hooks/useNfsePartnerFinancialPlan';
import { OtherCreditPlanTermsFields } from '../../financeiro/outros-creditos/OtherCreditPlanTermsFields';

export type NfsePartnerFinancialMode = 'CREATE' | 'LINK';

interface Props {
  mode: NfsePartnerFinancialMode;
  onMode: (value: NfsePartnerFinancialMode) => void;
  existingId: string;
  onExistingId: (value: string) => void;
  form: NfseServicePlanForm;
  onChange: (patch: Partial<NfseServicePlanForm>) => void;
  options?: NfsePartnerServiceOptions;
  receivables: NfseExistingReceivable[];
}

export default function NfsePartnerFinancialFields(props: Props) {
  return <section className="nfse-partner-form-section">
    <div className="nfse-partner-form-grid">
      <p className="nfse-inline-help nfse-wide">O recebível será gerado após a NFS-e ser autorizada e ficará em Financeiro &gt; A Receber &gt; Serviços.</p>
      <div className="nfse-field nfse-wide">
        <label htmlFor="nfse-partner-financial-mode">Conta a receber</label>
        <InstitutionalSelect id="nfse-partner-financial-mode" ariaLabel="Conta a receber" required value={props.mode}
          options={[{ value: 'CREATE', label: 'Criar após autorização da NFS-e' },
            ...(props.options?.capabilities.canLinkExistingReceivable ? [{ value: 'LINK', label: 'Vincular conta existente', disabled: props.receivables.length === 0 }] : [])]}
          onValueChange={(value) => { if (value === 'CREATE' || value === 'LINK') props.onMode(value); }} />
      </div>
      {props.mode === 'CREATE' && <>
        <fieldset className="nfse-partner-financial-choice nfse-wide"><legend>Forma de cobrança</legend><div>
          <label><input type="radio" name="nfse-service-charge" checked={!props.form.issueBolePix} onChange={() => props.onChange({ issueBolePix: false })} />Somente contas a receber</label>
          <label><input type="radio" name="nfse-service-charge" checked={props.form.issueBolePix} disabled={!props.options?.capabilities.canIssueBolePix} onChange={() => props.onChange({ issueBolePix: true })} />Gerar BolePix</label>
        </div></fieldset>
        {!props.options?.capabilities.canIssueBolePix && <p className="nfse-inline-help nfse-wide">A emissão BolePix precisa estar habilitada para seu acesso e para esta unidade.</p>}
        <label className="nfse-field"><span>Quantidade de parcelas</span><input aria-label="Quantidade de parcelas" type="number" min="1" max="60" step="1" required value={props.form.quantity} onChange={e => props.onChange({ quantity: e.target.value })} /></label>
        <label className="nfse-field"><span>Primeiro vencimento</span><input aria-label="Primeiro vencimento" type="date" required value={props.form.firstDueDate} onChange={e => props.onChange({ firstDueDate: e.target.value })} /></label>
        <div className="nfse-field"><label htmlFor="nfse-service-periodicity">Periodicidade</label><InstitutionalSelect id="nfse-service-periodicity" ariaLabel="Periodicidade" value={props.form.periodicity}
          options={[{ value: 'MENSAL_CALENDARIO', label: 'Mensal · mesmo dia' }, { value: 'DIAS_CORRIDOS_30', label: 'A cada 30 dias' }]}
          onValueChange={value => { if (value === 'MENSAL_CALENDARIO' || value === 'DIAS_CORRIDOS_30') props.onChange({ periodicity: value }); }} /></div>
        <div className="nfse-wide"><OtherCreditPlanTermsFields label="parcelas" terms={props.form} onChange={props.onChange} twoDecimalInputs /></div>
        <p className="nfse-inline-help nfse-wide">O valor total do serviço será dividido pelo sistema. As parcelas e os centavos serão conferidos na próxima etapa.</p>
      </>}
      {props.mode === 'LINK' && <div className="nfse-field nfse-wide"><label htmlFor="nfse-partner-existing">Conta existente</label>
        <InstitutionalSelect id="nfse-partner-existing" ariaLabel="Conta existente" required value={props.existingId}
          options={props.receivables.map((item) => ({ value: item.id, label: `${item.description} · ${formatNfseMoney(item.amount)} · ${nfsePartnerDate(item.dueDate)}` }))}
          onValueChange={props.onExistingId} />
      </div>}
    </div>
  </section>;
}
