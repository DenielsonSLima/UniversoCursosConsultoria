import React from 'react';
import type { Construction, PropertyUnit, ServiceEvent, NfseAdditionalDraftValue as Draft } from '../services/nfse-model-additional.types';
import { AdditionalAddress, AdditionalChoice, AdditionalRuleField, AdditionalText, blankServiceAddress, type AdditionalProps } from './NfseAdditionalControls';
import { nfseAdditionalScenario } from '../services/nfse-model-additional-validation';

export function NfseAdditionalConstruction({ value, onChange, context }: AdditionalProps) {
  const scenario = nfseAdditionalScenario(context, value);
  if (!value || !scenario.constructionAllowed) return null;
  return <section className="nfse-model-section"><h3>Informações para obra</h3><div className="nfse-model-grid">
    <AdditionalRuleField<Construction> label="Informações da obra" optional={!scenario.construction} value={value.service.construction}
      onChange={next => onChange({ ...value, service: { ...value.service, construction: next } })}
      createFixed={() => ({ propertyTaxRegistration: null, identification: { kind: null, workCode: null, cib: null, address: null } })}>
      {(fixed, update) => <>
        <AdditionalText label="Inscrição imobiliária fiscal da obra" maxLength={30} value={fixed.propertyTaxRegistration} onChange={next => update({ ...fixed, propertyTaxRegistration: next || null })} />
        <AdditionalChoice label="Identificação da obra" value={fixed.identification.kind}
          options={[...(scenario.brazil ? [{ value: 'WORK_CODE', label: 'Código da obra (CNO/CEI)' }, { value: 'CIB', label: 'Cadastro Imobiliário Brasileiro (CIB)' }] : []), { value: 'ADDRESS', label: 'Endereço da obra' }]}
          onChange={kind => update({ ...fixed, identification: { kind: kind as typeof fixed.identification.kind, workCode: null, cib: null, address: kind === 'ADDRESS' ? blankServiceAddress(scenario.brazil) : null } })} />
        {fixed.identification.kind === 'WORK_CODE' && <AdditionalText label="Código da obra (CNO/CEI)" maxLength={30} value={fixed.identification.workCode} onChange={next => update({ ...fixed, identification: { ...fixed.identification, workCode: next } })} />}
        {fixed.identification.kind === 'CIB' && <AdditionalText label="CIB da obra" maxLength={8} value={fixed.identification.cib} onChange={next => update({ ...fixed, identification: { ...fixed.identification, cib: next } })} />}
        {fixed.identification.address && <AdditionalAddress brazil={scenario.brazil} value={fixed.identification.address} onChange={address => update({ ...fixed, identification: { ...fixed.identification, address } })} />}
      </>}
    </AdditionalRuleField>
  </div></section>;
}

export function NfseAdditionalEvent({ value, onChange, context }: AdditionalProps) {
  const scenario = nfseAdditionalScenario(context, value);
  if (!value || !scenario.event) return null;
  return <section className="nfse-model-section"><h3>Atividade de evento</h3><div className="nfse-model-grid">
    <AdditionalRuleField<ServiceEvent> label="Atividade de evento" optional={false} value={value.service.event}
      onChange={next => onChange({ ...value, service: { ...value.service, event: next } })}
      createFixed={() => ({ description: '', startDate: '', endDate: '', identification: { kind: null, municipalId: null, address: null } })}>
      {(fixed, update) => <>
        <AdditionalText label="Descrição da atividade de evento" maxLength={255} value={fixed.description} onChange={description => update({ ...fixed, description })} />
        <AdditionalText label="Data inicial do evento" type="date" value={fixed.startDate} onChange={startDate => update({ ...fixed, startDate })} />
        <AdditionalText label="Data final do evento" type="date" value={fixed.endDate} onChange={endDate => update({ ...fixed, endDate })} />
        <AdditionalChoice label="Identificação do local do evento" value={fixed.identification.kind}
          options={[...(scenario.brazil ? [{ value: 'MUNICIPAL_ID', label: 'Identificador municipal do evento' }] : []), { value: 'ADDRESS', label: 'Endereço do evento' }]}
          onChange={kind => update({ ...fixed, identification: { kind: kind as typeof fixed.identification.kind, municipalId: null, address: kind === 'ADDRESS' ? blankServiceAddress(scenario.brazil) : null } })} />
        {fixed.identification.kind === 'MUNICIPAL_ID' && <AdditionalText label="Identificador municipal do evento" maxLength={30} value={fixed.identification.municipalId} onChange={municipalId => update({ ...fixed, identification: { ...fixed.identification, municipalId } })} />}
        {fixed.identification.address && <AdditionalAddress brazil={scenario.brazil} value={fixed.identification.address} onChange={address => update({ ...fixed, identification: { ...fixed.identification, address } })} />}
      </>}
    </AdditionalRuleField>
  </div></section>;
}

function PropertyIdentification({ value, onChange, brazil }: { value: Draft<PropertyUnit>; onChange: (value: Draft<PropertyUnit>) => void; brazil: boolean }) {
  return <>
    <AdditionalText label="Inscrição imobiliária fiscal do imóvel" maxLength={30} value={value.propertyTaxRegistration} onChange={next => onChange({ ...value, propertyTaxRegistration: next || null })} />
    <AdditionalChoice label="Identificação do imóvel" value={value.identification.kind}
      options={[...(brazil ? [{ value: 'CIB', label: 'Cadastro Imobiliário Brasileiro (CIB)' }] : []), { value: 'ADDRESS', label: 'Endereço do imóvel' }]}
      onChange={kind => onChange({ ...value, identification: { kind: kind as typeof value.identification.kind, cib: null, address: kind === 'ADDRESS' ? blankServiceAddress(brazil) : null } })} />
    {value.identification.kind === 'CIB' && <AdditionalText label="CIB do imóvel" maxLength={8} value={value.identification.cib} onChange={cib => onChange({ ...value, identification: { ...value.identification, cib } })} />}
    {value.identification.address && <AdditionalAddress brazil={brazil} value={value.identification.address} onChange={address => onChange({ ...value, identification: { ...value.identification, address } })} />}
  </>;
}

export function NfseAdditionalProperty({ value, onChange, context }: AdditionalProps) {
  const scenario = nfseAdditionalScenario(context, value);
  if (!value || !scenario.property) return null;
  const property = value.service.property;
  const update = (next: NonNullable<typeof property>) => onChange({ ...value, service: { ...value.service, property: next } });
  return <section className="nfse-model-section"><h3>Informações do imóvel</h3>
    {!property ? <button type="button" className="nfse-button nfse-button-secondary" onClick={() => update({ municipality: { source: 'AT_ISSUANCE', value: null }, units: { source: 'AT_ISSUANCE', value: null }, originalDueDate: null })}>Configurar imóvel</button>
      : <div className="nfse-model-grid">
        <label className="nfse-field"><span>Município da prestação</span><input readOnly value={context.serviceOptions?.municipalityLabel || context.serviceOptions?.municipalityCode || 'Definido pelo local da prestação'} /></label>
        <AdditionalRuleField<PropertyUnit[]> label="Identificação do imóvel" optional={false} value={property.units} onChange={units => { if (units) update({ ...property, units }); }}
          createFixed={() => [{ unitKey: crypto.randomUUID(), propertyTaxRegistration: null, identification: { kind: null, cib: null, address: null } }]}>
          {(units, change) => <>{units[0] && <PropertyIdentification value={units[0]} brazil={scenario.brazil} onChange={unit => change([unit, ...units.slice(1)])} />}
            {units.length > 1 && <p className="nfse-wide nfse-portal-note">Há mais de um imóvel cadastrado. Este formulário utiliza o ramo de um imóvel do portal Web.</p>}</>}
        </AdditionalRuleField>
      </div>}
  </section>;
}
