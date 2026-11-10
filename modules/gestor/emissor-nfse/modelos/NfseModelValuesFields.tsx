import React, { useId } from 'react';
import NfseModelAmountRuleField, { NfseValuesChoice, NfseValuesDecimalField } from './NfseModelAmountRuleField';
import NfseModelMunicipalValues from './NfseModelMunicipalValues';
import NfseModelFederalValues from './NfseModelFederalValues';
import NfseModelIbsCbsValues from './NfseModelIbsCbsValues';
import NfseModelTransparencyValues from './NfseModelTransparencyValues';
import { createEmptyNfseModelValuesOptions } from './services/nfse-model-values-options';
import { validateNfseModelValuesOptions } from './services/nfse-model-values-validation';
import type { NfseModelValuesDraft, NfseValuesCatalogs, NfseValuesContext } from './services/nfse-model-values.types';

export interface NfseModelValuesFieldsProps {
  value: NfseModelValuesDraft | null;
  onChange: (value: NfseModelValuesDraft) => void;
  context: NfseValuesContext;
  catalogs: NfseValuesCatalogs;
  catalogsLoading?: boolean;
  catalogsError?: boolean;
  onRetryCatalogs?: () => void;
  disabled?: boolean;
}
export default function NfseModelValuesFields({ value, onChange, context, catalogs, catalogsLoading = false,
  catalogsError = false, onRetryCatalogs = () => {}, disabled = false }: NfseModelValuesFieldsProps) {
  const id = useId();
  if (value === null) return <section className="nfse-model-section"><h3>Valores e tributação</h3>
    <p>Configure as fontes dos valores e as regras tributárias deste pré-modelo.</p>
    <button type="button" className="nfse-button nfse-button-secondary" disabled={disabled}
      onClick={() => onChange(createEmptyNfseModelValuesOptions())}>Configurar valores e tributação</button></section>;
  const patch = (change: Partial<NfseModelValuesDraft>) => onChange({ ...value, ...change });
  const issues = validateNfseModelValuesOptions(value, context, catalogs);
  return <fieldset disabled={disabled} className="nfse-model-fields">
    <section className="nfse-model-section"><h3>Valores do serviço prestado</h3><div className="nfse-model-grid">
      <NfseValuesChoice id={`${id}-service-source`} label="Origem do valor do serviço" value={value.serviceAmount.source}
        options={[{ value: 'RECEIPTS', label: 'Recebimentos selecionados para a emissão' }, { value: 'FIXED', label: 'Valor fixo definido no modelo' }]}
        onChange={next => patch({ serviceAmount: { source: next as 'RECEIPTS' | 'FIXED', fixedAmount: null }, rental: null })} />
      {value.serviceAmount.source === 'FIXED' && <NfseValuesDecimalField id={`${id}-service-amount`} label="Valor fixo do serviço (R$)"
        value={value.serviceAmount.fixedAmount} onChange={next => patch({ serviceAmount: { source: 'FIXED', fixedAmount: next } })} />}
      <p className="nfse-wide nfse-portal-note">O valor do serviço será resolvido pela fonte escolhida. Descontos já incorporados ao recebimento não serão aplicados novamente.</p>
      <NfseModelAmountRuleField id={`${id}-intermediary`} label="Valor recebido pelo intermediário" value={value.intermediaryAmount}
        onChange={next => patch({ intermediaryAmount: next })} help="Este campo representa o valor recebido pelo intermediário da operação. Não é o total dos recebimentos financeiros do prestador." />
      <NfseModelAmountRuleField id={`${id}-unconditional`} label="Desconto incondicionado" value={value.unconditionalDiscount}
        onChange={next => patch({ unconditionalDiscount: next })} />
      <NfseModelAmountRuleField id={`${id}-conditional`} label="Desconto condicionado" value={value.conditionalDiscount}
        onChange={next => patch({ conditionalDiscount: next })} help="O desconto condicionado não reduz a base do ISSQN." />
    </div></section>
    <NfseModelMunicipalValues id={`${id}-iss`} value={value} onChange={onChange} context={context} />
    <NfseModelFederalValues id={`${id}-federal`} value={value.federal} onChange={next => patch({ federal: next })} context={context} />
    <NfseModelIbsCbsValues id={`${id}-ibs`} value={value.ibscbs} onChange={next => patch({ ibscbs: next })} context={context}
      catalogs={catalogs} loading={catalogsLoading} error={catalogsError} onRetry={onRetryCatalogs} />
    <NfseModelTransparencyValues id={`${id}-transparency`} value={value.transparency} onChange={next => patch({ transparency: next })} context={context} />
    {issues.length > 0 && <div className="nfse-model-section" role="status"><h3>Para concluir Valores</h3>
      <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
  </fieldset>;
}
