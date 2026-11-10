import React, { useId } from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { createDefaultNfseModelPeopleOptions, type NfseModelPeopleOptions } from './services/nfse-model-people-options';

export interface NfsePeoplePartnerLookup {
  options: readonly { value: string; label: string }[];
  loading: boolean;
  error: boolean;
  search: (query: string) => void;
  retry: () => void;
}
interface Detail { label: string; value: string }
interface Props {
  value: NfseModelPeopleOptions | null;
  onChange: (next: NfseModelPeopleOptions) => void;
  includeIbsCbs: boolean | null;
  governmentPurchase?: boolean | null;
  afterIssuer?: React.ReactNode;
  destinationLookup?: NfsePeoplePartnerLookup;
  intermediaryLookup?: NfsePeoplePartnerLookup;
  issuerDetails?: readonly Detail[];
  disabled?: boolean;
}
const locations = [{ value: 'BRASIL', label: 'Brasil' }, { value: 'EXTERIOR', label: 'Exterior' },
  { value: 'NOT_INFORMED', label: 'Não informado' }];
const simpleOptions = [{ value: 'FROM_ESTABLISHMENT', label: 'Usar enquadramento da unidade' },
  { value: '1', label: 'Não optante' }, { value: '2', label: 'Optante · MEI' }, { value: '3', label: 'Optante · ME/EPP' }];
const assessmentOptions = [{ value: 'FROM_ESTABLISHMENT', label: 'Usar regime de apuração da unidade' },
  { value: '1', label: 'Tributos federais e ISSQN no Simples Nacional' },
  { value: '2', label: 'Federais no Simples; ISSQN conforme legislação municipal' },
  { value: '3', label: 'Federais e ISSQN fora do Simples Nacional' }];

function Choice({ id, label, value, options, onChange, required = true }: {
  id: string; label: string; value: string; options: readonly { value: string; label: string }[];
  onChange: (value: string) => void; required?: boolean;
}) {
  return <div className="nfse-field"><label htmlFor={id}>{label}{required && <span className="nfse-model-required"> *</span>}</label>
    <InstitutionalSelect id={id} ariaLabel={label} required={required} value={value} options={options}
      onValueChange={next => { if (options.some(option => option.value === next)) onChange(next); }} />
  </div>;
}

function PartyDetails({ source, includeAddress, exterior = false, details = [], issuer = false }: {
  source: string; includeAddress: boolean; exterior?: boolean; details?: readonly Detail[]; issuer?: boolean;
}) {
  const labels = issuer ? ['Município', 'Inscrição municipal', 'CNPJ', 'Razão Social',
    'Opção pelo Simples Nacional', 'Apuração tributária do Simples', 'Regime especial de tributação']
    : [exterior ? 'Documento no exterior / NIF' : 'CPF/CNPJ', 'Indicador Municipal', 'Nome/Razão Social', 'Telefone', 'E-mail'];
  if (includeAddress) labels.push(...(exterior ? ['País', 'Cidade', 'Estado, província ou região', 'Código de endereçamento postal']
    : issuer ? ['CEP'] : ['CEP', 'Município']), 'Bairro', 'Logradouro', 'Número', 'Complemento');
  return <div className="nfse-model-grid">
    {labels.map(label => <label className="nfse-field" key={label}><span>{label}</span>
      <input readOnly value={details.find(detail => detail.label === label)?.value || ''} placeholder={source} />
    </label>)}
    <p className="nfse-wide nfse-portal-note">{source}</p>
  </div>;
}

function PartnerChoice({ id, label, value, selectedLabel, lookup, onChange }: {
  id: string; label: string; value: string | null; selectedLabel?: string | null;
  lookup?: NfsePeoplePartnerLookup; onChange: (value: string, label: string) => void;
}) {
  const missing = Boolean(value && lookup && !lookup.loading && !lookup.error && !lookup.options.some(item => item.value === value));
  const options = [...(lookup?.options || [])];
  if (value && !options.some(item => item.value === value)) options.unshift({ value, label: selectedLabel || 'Parceiro selecionado' });
  return <div className="nfse-model-grid nfse-wide">
    <label className="nfse-field"><span>Buscar parceiro por nome</span>
      <input type="search" placeholder="Digite para pesquisar" disabled={!lookup}
        onChange={event => lookup?.search(event.target.value)} />
    </label>
    <div className="nfse-field"><label htmlFor={id}>{label}<span className="nfse-model-required"> *</span></label>
      <InstitutionalSelect id={id} ariaLabel={label} required value={value || ''} options={options}
        disabled={!lookup} loading={lookup?.loading}
        error={!lookup ? 'Busca de parceiros indisponível.' : lookup.error ? 'Não foi possível consultar os parceiros.'
          : missing ? 'O parceiro salvo não está disponível nesta unidade.' : undefined}
        onValueChange={next => {
          const option = lookup?.options.find(item => item.value === next);
          if (option) onChange(option.value, option.label);
        }} />
    </div>
    {lookup?.error && <button className="nfse-button nfse-button-secondary" type="button" onClick={lookup.retry}>Tentar novamente</button>}
    <small className="nfse-wide">O vínculo é salvo pelo cadastro do parceiro. Seus dados atuais serão usados ao emitir.</small>
  </div>;
}

export default function NfseModelPeopleFields({ value, onChange, includeIbsCbs, governmentPurchase = null, afterIssuer,
  destinationLookup, intermediaryLookup, issuerDetails, disabled = false }: Props) {
  const prefix = useId();
  if (!value) return <section className="nfse-model-section">
    <h3>Pessoas</h3><p>Este modelo ainda não possui regras de pessoas.</p>
    <button className="nfse-button nfse-button-secondary" type="button" disabled={disabled}
      onClick={() => onChange(createDefaultNfseModelPeopleOptions())}>Configurar regras de pessoas</button>
  </section>;
  const patch = (change: Partial<NfseModelPeopleOptions>) => onChange({ ...value, ...change });
  const source = 'Cadastro do parceiro escolhido ao preparar a emissão';
  return <fieldset disabled={disabled} className="nfse-model-fields">
    <section className="nfse-model-section">
      <h3>Informações gerais da emissão</h3>
      <div className="nfse-model-grid">
        <Choice id={`${prefix}-competence-mode`} label="Data de Competência" value={value.competenceMode}
          options={[{ value: 'ISSUE_DATE', label: 'Usar data da emissão' }, { value: 'FIXED_DATE', label: 'Usar data fixa' }]}
          onChange={next => patch({ competenceMode: next as NfseModelPeopleOptions['competenceMode'], competenceDate: null })} />
        {value.competenceMode === 'FIXED_DATE' && <label className="nfse-field"><span>Data de competência fixa *</span>
          <input type="date" required min={includeIbsCbs === true ? '2026-01-01' : undefined}
            value={value.competenceDate || ''} onChange={event => patch({ competenceDate: event.target.value || null })} />
          {includeIbsCbs === true && <small>Com IBS/CBS, a competência deve ser a partir de 01/01/2026.</small>}
        </label>}
        <Choice id={`${prefix}-series-mode`} label="Série da DPS" value={value.dpsSeriesMode}
          options={[{ value: 'AUTOMATIC', label: 'Gerar automaticamente' }, { value: 'CUSTOM', label: 'Usar série personalizada' }]}
          onChange={next => patch({ dpsSeriesMode: next as NfseModelPeopleOptions['dpsSeriesMode'], dpsSeries: null })} />
        {value.dpsSeriesMode === 'CUSTOM' && <label className="nfse-field"><span>Série personalizada *</span>
          <input inputMode="numeric" required pattern="[0-9]{1,5}" maxLength={5} value={value.dpsSeries || ''}
            onChange={event => patch({ dpsSeries: event.target.value || null })} />
          <small>De 1 a 49999, com até 5 dígitos.</small>
        </label>}
        <label className="nfse-field"><span>Número da DPS</span><input readOnly value="Gerado de forma única na emissão" /></label>
        <label className="nfse-field"><span>Data e horário de emissão</span><input readOnly value="Gerados ao emitir a nota" /></label>
      </div>
    </section>
    <section className="nfse-model-section">
      <h3>Emitente da NFS-e</h3>
      <div className="nfse-model-grid">
        <Choice id={`${prefix}-issuer-role`} label="Você irá emitir esta NFS-e como?" value={value.issuerRole}
          options={[{ value: 'PROVIDER', label: 'Prestador/Fornecedor' }, { value: 'RECIPIENT', label: 'Tomador/Adquirente' },
            { value: 'INTERMEDIARY', label: 'Intermediário' }]}
          onChange={next => patch({ issuerRole: next as NfseModelPeopleOptions['issuerRole'] })} />
        <Choice id={`${prefix}-simple-option`} label="Opção no Simples Nacional" value={value.simpleNationalOption}
          options={simpleOptions} onChange={next => patch({ simpleNationalOption: next as NfseModelPeopleOptions['simpleNationalOption'], simpleNationalAssessment: null })} />
        {(value.simpleNationalOption === '3' || value.simpleNationalOption === 'FROM_ESTABLISHMENT') &&
          <Choice id={`${prefix}-simple-assessment`} label="Regime de Apuração dos Tributos no Simples Nacional"
            value={value.simpleNationalAssessment || (value.simpleNationalOption === 'FROM_ESTABLISHMENT' ? 'FROM_ESTABLISHMENT' : '')}
            options={assessmentOptions} required={value.simpleNationalOption === '3'}
            onChange={next => patch({ simpleNationalAssessment: next as NfseModelPeopleOptions['simpleNationalAssessment'] })} />}
      </div>
      <PartyDetails issuer details={issuerDetails} includeAddress source="Dados da configuração da unidade selecionada" />
    </section>
    {afterIssuer}
    <section className="nfse-model-section">
      <h3>Tomador/Adquirente do serviço</h3>
      <div className="nfse-model-grid">
        <Choice id={`${prefix}-recipient-location`} label="Onde está localizado o estabelecimento/domicílio do tomador?"
          value={value.recipientLocation} options={governmentPurchase === true ? locations.filter(option => option.value === 'BRASIL') : locations}
          onChange={next => patch({ recipientLocation: next as NfseModelPeopleOptions['recipientLocation'],
            ...(next === 'NOT_INFORMED' ? { recipientIncludeAddress: false } : {}) })} />
        {value.recipientLocation !== 'NOT_INFORMED' && <label className="nfse-model-active">
          <input type="checkbox" checked={value.recipientIncludeAddress}
            onChange={event => patch({ recipientIncludeAddress: event.target.checked })} />Informar endereço
        </label>}
      </div>
      {governmentPurchase === true && <p className="nfse-model-help">Em compras governamentais, o tomador deve estar localizado no Brasil.</p>}
      {value.recipientLocation !== 'NOT_INFORMED' && <PartyDetails source={source}
        includeAddress={value.recipientIncludeAddress} exterior={value.recipientLocation === 'EXTERIOR'} />}
    </section>
    <section className="nfse-model-section">
      <h3>Destinatário do serviço</h3>
      {includeIbsCbs === true ? <div className="nfse-model-grid">
        <Choice id={`${prefix}-destination-same`} label="Para fins de apuração do IBS/CBS, o destinatário é o próprio adquirente?"
          value={value.recipientIsDestination === null ? '' : value.recipientIsDestination ? 'YES' : 'NO'}
          options={[{ value: 'YES', label: 'Sim' }, { value: 'NO', label: 'Não' }]}
          onChange={next => patch({ recipientIsDestination: next === 'YES', destinationPartnerId: null, destinationPartnerLabel: null })} />
        {value.recipientIsDestination === false && <>
          <PartnerChoice id={`${prefix}-destination-partner`} label="Parceiro destinatário" value={value.destinationPartnerId}
            selectedLabel={value.destinationPartnerLabel} lookup={destinationLookup}
            onChange={(id, label) => patch({ destinationPartnerId: id, destinationPartnerLabel: label })} />
          <div className="nfse-wide"><PartyDetails source="Dados do parceiro destinatário selecionado" includeAddress /></div>
        </>}
      </div> : <p>Disponível quando o modelo preencher as informações IBS/CBS.</p>}
    </section>
    <section className="nfse-model-section">
      <h3>Intermediário do serviço</h3>
      <div className="nfse-model-grid">
        <Choice id={`${prefix}-intermediary-location`} label="Onde está localizado o estabelecimento/domicílio do intermediário?"
          value={value.intermediaryLocation} options={locations}
          onChange={next => patch({ intermediaryLocation: next as NfseModelPeopleOptions['intermediaryLocation'],
            intermediaryPartnerId: null, intermediaryPartnerLabel: null })} />
        {value.intermediaryLocation !== 'NOT_INFORMED' && <>
          <PartnerChoice id={`${prefix}-intermediary-partner`} label="Parceiro intermediário" value={value.intermediaryPartnerId}
            selectedLabel={value.intermediaryPartnerLabel} lookup={intermediaryLookup}
            onChange={(id, label) => patch({ intermediaryPartnerId: id, intermediaryPartnerLabel: label })} />
          <div className="nfse-wide"><PartyDetails source="Dados do parceiro intermediário selecionado" includeAddress
            exterior={value.intermediaryLocation === 'EXTERIOR'} /></div>
        </>}
      </div>
    </section>
  </fieldset>;
}
