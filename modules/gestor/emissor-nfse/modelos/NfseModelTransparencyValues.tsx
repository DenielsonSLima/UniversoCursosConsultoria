import React from 'react';
import NfseModelAmountRuleField, { NfseValuesChoice, NfseValuesDecimalField } from './NfseModelAmountRuleField';
import { noNfseAmount } from './services/nfse-model-values-rules';
import type { NfseModelValuesDraft, NfseValuesContext } from './services/nfse-model-values.types';

export default function NfseModelTransparencyValues({ id, value, onChange, context }: {
  id: string; value: NfseModelValuesDraft['transparency']; onChange: (value: NfseModelValuesDraft['transparency']) => void;
  context: NfseValuesContext;
}) {
  const patch = (change: Partial<typeof value>) => onChange({ ...value, ...change });
  const amounts = ['federal', 'state', 'municipal'] as const;
  const percentages = ['federalPercent', 'statePercent', 'municipalPercent'] as const;
  const names = ['federais', 'estaduais', 'municipais'];
  return <section className="nfse-model-section"><h3>Valor aproximado dos tributos</h3><div className="nfse-model-grid">
    <NfseValuesChoice id={`${id}-mode`} label="Como informar a estimativa tributária?" value={value.mode}
      options={[{ value: 'AMOUNTS', label: 'Valores monetários' }, { value: 'PERCENTAGES', label: 'Percentuais' },
        { value: 'SIMPLE_NATIONAL_PERCENTAGE', label: 'Alíquota nominal do Simples Nacional', disabled: context.simpleNationalOption !== '3' },
        { value: 'NOT_INFORMED', label: 'Não informar, quando permitido', disabled: context.simpleNationalOption !== '2' }]}
      onChange={next => onChange({ mode: next as typeof value.mode, federal: noNfseAmount(), state: noNfseAmount(), municipal: noNfseAmount(),
        federalPercent: null, statePercent: null, municipalPercent: null, simpleNationalPercent: null })} />
    {value.mode === 'AMOUNTS' && amounts.map((key, index) => <div className="nfse-wide" key={key}><NfseModelAmountRuleField id={`${id}-${key}`}
      label={`Estimativa de tributos ${names[index]}`} value={value[key]} allowNone={false}
      onChange={next => patch({ [key]: next })} /></div>)}
    {value.mode === 'PERCENTAGES' && percentages.map((key, index) => <div className="nfse-field" key={key}><NfseValuesDecimalField id={`${id}-${key}`}
      label={`Percentual aproximado de tributos ${names[index]} (%)`} kind="PERCENT" value={value[key]}
      onChange={next => patch({ [key]: next })} /></div>)}
    {value.mode === 'SIMPLE_NATIONAL_PERCENTAGE' && <NfseValuesDecimalField id={`${id}-simple`} label="Alíquota nominal do Simples Nacional (%)"
      kind="PERCENT" value={value.simpleNationalPercent} onChange={next => patch({ simpleNationalPercent: next })} />}
    <p className="nfse-wide nfse-portal-note">A estimativa tributária deve vir de uma fonte confirmada. A alíquota nominal do Simples não é a alíquota de ISSQN.</p>
  </div></section>;
}
