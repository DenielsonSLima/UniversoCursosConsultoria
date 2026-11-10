import React, { useId } from 'react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import type { Rule, NfseAdditionalDraftValue as Draft, ServiceAddress, NfseModelAdditionalDraft } from '../services/nfse-model-additional.types';
import type { NfseModelPresetContext } from '../services/nfse-model-preset-context';

export interface AdditionalProps { value: NfseModelAdditionalDraft | null; onChange: (value: NfseModelAdditionalDraft) => void; context: NfseModelPresetContext; disabled?: boolean }
export function AdditionalChoice({ label, value, options, onChange }: { label: string; value: string | null; options: readonly { value: string; label: string; disabled?: boolean }[]; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="nfse-field"><label htmlFor={id}>{label}</label><InstitutionalSelect id={id} ariaLabel={label}
    value={value || ''} options={options} onValueChange={next => { if (options.some(option => option.value === next && !option.disabled)) onChange(next); }} /></div>;
}
export function AdditionalText({ label, value, onChange, maxLength = 255, type = 'text' }: {
  label: string; value: string | null; onChange: (value: string) => void; maxLength?: number; type?: 'text' | 'date';
}) {
  return <label className="nfse-field"><span>{label}</span><input aria-label={label} type={type} maxLength={maxLength}
    value={value || ''} onChange={event => onChange(event.target.value)} /></label>;
}
export function AdditionalRuleField<T>({ label, value, onChange, createFixed, children, optional = true, allowFixed = true }: {
  label: string; value: Draft<Rule<T>> | null; onChange: (rule: Draft<Rule<T>> | null) => void;
  createFixed: () => Draft<T>; children: (value: Draft<T>, onChange: (value: Draft<T>) => void) => React.ReactNode; optional?: boolean; allowFixed?: boolean;
}) {
  return <div className="nfse-wide"><div className="nfse-model-grid">
    <AdditionalChoice label={`Origem: ${label}`} value={value?.source || (optional ? 'NONE' : '')}
      options={[...(optional ? [{ value: 'NONE', label: 'Não informar' }] : []), { value: 'AT_ISSUANCE', label: 'Definir na emissão' }, { value: 'FIXED', label: 'Definir neste pré-modelo', disabled: !allowFixed }]}
      onChange={source => onChange(source === 'NONE' ? null : source === 'AT_ISSUANCE'
        ? { source: 'AT_ISSUANCE', value: null } as Draft<Rule<T>> : { source: 'FIXED', value: createFixed() } as Draft<Rule<T>>)} />
    {value?.source === 'AT_ISSUANCE' && <p className="nfse-portal-note">{label}: o valor concreto será conferido ao preparar a emissão.</p>}
    {allowFixed && value?.source === 'FIXED' && children((value.value ?? createFixed()) as Draft<T>, fixed => onChange({ source: 'FIXED', value: fixed } as Draft<Rule<T>>))}
  </div></div>;
}
export const blankServiceAddress = (brazil: boolean): Draft<ServiceAddress> => ({ postalCode: '', street: '', number: '',
  complement: null, district: '', city: brazil ? null : '', stateProvince: brazil ? null : '' });
export function AdditionalAddress({ value, onChange, brazil }: { value: Draft<ServiceAddress>; onChange: (value: Draft<ServiceAddress>) => void; brazil: boolean }) {
  const patch = (key: keyof ServiceAddress, next: string) => onChange({ ...value, [key]: next || null });
  return <div className="nfse-model-grid nfse-wide">
    <AdditionalText label={brazil ? 'CEP do local' : 'Código postal no exterior'} maxLength={brazil ? 8 : 11} value={value.postalCode} onChange={next => patch('postalCode', next)} />
    <AdditionalText label="Logradouro do local" value={value.street} onChange={next => patch('street', next)} />
    <AdditionalText label="Número do local" maxLength={60} value={value.number} onChange={next => patch('number', next)} />
    <AdditionalText label="Complemento do local" maxLength={156} value={value.complement} onChange={next => patch('complement', next)} />
    <AdditionalText label="Bairro do local" maxLength={60} value={value.district} onChange={next => patch('district', next)} />
    {!brazil && <><AdditionalText label="Cidade no exterior" maxLength={60} value={value.city} onChange={next => patch('city', next)} />
      <AdditionalText label="Estado, província ou região" maxLength={60} value={value.stateProvince} onChange={next => patch('stateProvince', next)} /></>}
    <p className="nfse-wide nfse-portal-note">O país e o município da prestação permanecem definidos nos campos de local do serviço.</p>
  </div>;
}
export function AdditionalTextList({ label, values, onChange, maxLength, maxItems = 99 }: {
  label: string; values: (string | null)[]; onChange: (values: (string | null)[]) => void; maxLength: number; maxItems?: number;
}) {
  return <div className="nfse-wide">
    {values.map((value, index) => <div className="nfse-model-grid" key={index}>
      <AdditionalText label={`${label} ${index + 1}`} maxLength={maxLength} value={value} onChange={next => onChange(values.map((item, position) => position === index ? next : item))} />
      <button type="button" className="nfse-button nfse-button-secondary" onClick={() => onChange(values.filter((_, position) => position !== index))}>Remover {label.toLowerCase()} {index + 1}</button>
    </div>)}
    <button type="button" className="nfse-button nfse-button-secondary" disabled={values.length >= maxItems} onClick={() => onChange([...values, ''])}>Adicionar {label.toLowerCase()}</button>
    <p className="nfse-portal-note">{values.length}/{maxItems} itens.</p>
  </div>;
}
