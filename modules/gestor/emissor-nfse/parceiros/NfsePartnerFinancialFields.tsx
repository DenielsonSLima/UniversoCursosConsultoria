import React from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { formatNfseMoney } from '../components/nfse.presentation';
import type { NfseExistingReceivable, NfsePartnerServiceOptions } from './types/nfse-partner-services.types';
import { nfsePartnerDate } from './nfse-partner-services.presentation';

export type NfsePartnerFinancialMode = '' | 'CREATE' | 'LINK';

interface Props {
  generate: boolean;
  onGenerate: (value: boolean) => void;
  mode: NfsePartnerFinancialMode;
  onMode: (value: NfsePartnerFinancialMode) => void;
  existingId: string;
  onExistingId: (value: string) => void;
  dueDate: string;
  onDueDate: (value: string) => void;
  categoryId: string;
  onCategoryId: (value: string) => void;
  options?: NfsePartnerServiceOptions;
  receivables: NfseExistingReceivable[];
}

export default function NfsePartnerFinancialFields(props: Props) {
  return <section className="nfse-partner-form-section">
    <fieldset className="nfse-partner-financial-choice">
      <legend>Gerar contas a receber?</legend>
      <div>
        <label><input type="radio" name="nfse-partner-generate" checked={!props.generate} onChange={() => props.onGenerate(false)} />Não</label>
        <label><input type="radio" name="nfse-partner-generate" checked={props.generate} disabled={!props.options?.capabilities.canGenerateReceivable} onChange={() => props.onGenerate(true)} />Sim</label>
      </div>
    </fieldset>
    {props.generate && <div className="nfse-partner-form-grid">
      <p className="nfse-inline-help nfse-wide">A conta será registrada no Financeiro.</p>
      <div className="nfse-field nfse-wide">
        <label htmlFor="nfse-partner-financial-mode">Conta a receber</label>
        <InstitutionalSelect id="nfse-partner-financial-mode" ariaLabel="Conta a receber" required value={props.mode}
          options={[{ value: 'CREATE', label: 'Criar nova conta' }, { value: 'LINK', label: 'Vincular conta existente', disabled: props.receivables.length === 0 }]}
          onValueChange={(value) => { if (value === 'CREATE' || value === 'LINK') props.onMode(value); }} />
      </div>
      {props.mode === 'CREATE' && <>
        <label className="nfse-field"><span>Vencimento</span><input type="date" required value={props.dueDate} onChange={(event) => props.onDueDate(event.target.value)} /></label>
        <div className="nfse-field"><label htmlFor="nfse-partner-category">Categoria financeira</label>
          <InstitutionalSelect id="nfse-partner-category" ariaLabel="Categoria financeira" required value={props.categoryId}
            options={(props.options?.categories || []).map((category) => ({ value: category.id, label: category.name }))} onValueChange={props.onCategoryId} />
        </div>
      </>}
      {props.mode === 'LINK' && <div className="nfse-field nfse-wide"><label htmlFor="nfse-partner-existing">Conta existente</label>
        <InstitutionalSelect id="nfse-partner-existing" ariaLabel="Conta existente" required value={props.existingId}
          options={props.receivables.map((item) => ({ value: item.id, label: `${item.description} · ${formatNfseMoney(item.amount)} · ${nfsePartnerDate(item.dueDate)}` }))}
          onValueChange={props.onExistingId} />
      </div>}
    </div>}
  </section>;
}
