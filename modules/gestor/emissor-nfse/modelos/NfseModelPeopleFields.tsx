import React, { useId } from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { createDefaultNfseModelPeopleOptionsV2, upgradeNfseModelPeopleOptions,
  type NfseModelPeopleOptions, type NfseModelPeopleOptionsV2 } from './services/nfse-model-people-options';

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
  issuerDetails?: readonly Detail[];
  disabled?: boolean;
}
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

function IssuerDetails({ details }: { details: readonly Detail[] }) {
  return <details className="nfse-model-issuer-details">
    <summary>Consultar cadastro do estabelecimento</summary>
    <dl className="nfse-model-grid nfse-model-party-details">
      {details.map(detail => <div className="nfse-model-issuer-detail" key={detail.label}>
        <dt>{detail.label}</dt><dd>{detail.value}</dd>
      </div>)}
    </dl>
  </details>;
}

export default function NfseModelPeopleFields({ value, onChange, includeIbsCbs, governmentPurchase = null,
  afterIssuer, issuerDetails = [], disabled = false }: Props) {
  const prefix = useId();
  if (!value || value.version !== 2) return <section className="nfse-model-section">
    <h3>Regras da emissão</h3>
    <p className="nfse-model-help">O aluno ou parceiro será escolhido ao emitir cada nota.</p>
    <button className="nfse-button nfse-button-secondary" type="button" disabled={disabled}
      onClick={() => onChange(value ? upgradeNfseModelPeopleOptions(value, includeIbsCbs) : createDefaultNfseModelPeopleOptionsV2())}>
      Configurar regras da emissão
    </button>
  </section>;
  const patch = (change: Partial<NfseModelPeopleOptionsV2>) => onChange({ ...value, ...change });
  return <fieldset disabled={disabled} className="nfse-model-fields">
    <section className="nfse-model-section">
      <h3>Regras gerais da emissão</h3>
      <div className="nfse-model-grid">
        <Choice id={`${prefix}-competence-mode`} label="Data de Competência" value={value.competenceMode}
          options={[{ value: 'ISSUE_DATE', label: 'Usar data da emissão' }, { value: 'FIXED_DATE', label: 'Usar data fixa' }]}
          onChange={next => patch({ competenceMode: next as NfseModelPeopleOptionsV2['competenceMode'], competenceDate: null })} />
        {value.competenceMode === 'FIXED_DATE' && <label className="nfse-field"><span>Data de competência fixa *</span>
          <input type="date" required min={includeIbsCbs === true ? '2026-01-01' : undefined}
            value={value.competenceDate || ''} onChange={event => patch({ competenceDate: event.target.value || null })} />
          {includeIbsCbs === true && <small>Com IBS/CBS, a competência deve ser a partir de 01/01/2026.</small>}
        </label>}
        <Choice id={`${prefix}-series-mode`} label="Série da DPS" value={value.dpsSeriesMode}
          options={[{ value: 'AUTOMATIC', label: 'Gerar automaticamente' }, { value: 'CUSTOM', label: 'Usar série personalizada' }]}
          onChange={next => patch({ dpsSeriesMode: next as NfseModelPeopleOptionsV2['dpsSeriesMode'], dpsSeries: null })} />
        {value.dpsSeriesMode === 'CUSTOM' && <label className="nfse-field"><span>Série personalizada *</span>
          <input inputMode="numeric" required pattern="[0-9]{1,5}" maxLength={5} value={value.dpsSeries || ''}
            onChange={event => patch({ dpsSeries: event.target.value || null })} />
          <small>De 1 a 49999, com até 5 dígitos.</small>
        </label>}
      </div>
      <p className="nfse-model-party-origin">Na emissão de cursos, escolha o aluno. Em Serviços, escolha o parceiro PF ou PJ.
        Os dados do tomador e seu endereço serão obtidos desse cadastro em cada nota.</p>
    </section>
    <section className="nfse-model-section">
      <h3>Estabelecimento e enquadramento</h3>
      <div className="nfse-model-grid">
        <Choice id={`${prefix}-issuer-role`} label="Você irá emitir esta NFS-e como?" value={value.issuerRole}
          options={[{ value: 'PROVIDER', label: 'Prestador/Fornecedor' }, { value: 'RECIPIENT', label: 'Tomador/Adquirente' },
            { value: 'INTERMEDIARY', label: 'Intermediário' }]}
          onChange={next => patch({ issuerRole: next as NfseModelPeopleOptionsV2['issuerRole'] })} />
        <Choice id={`${prefix}-simple-option`} label="Opção no Simples Nacional" value={value.simpleNationalOption}
          options={simpleOptions} onChange={next => patch({ simpleNationalOption: next as NfseModelPeopleOptionsV2['simpleNationalOption'], simpleNationalAssessment: null })} />
        {(value.simpleNationalOption === '3' || value.simpleNationalOption === 'FROM_ESTABLISHMENT') &&
          <Choice id={`${prefix}-simple-assessment`} label="Regime de Apuração dos Tributos no Simples Nacional"
            value={value.simpleNationalAssessment || (value.simpleNationalOption === 'FROM_ESTABLISHMENT' ? 'FROM_ESTABLISHMENT' : '')}
            options={assessmentOptions} required={value.simpleNationalOption === '3'}
            onChange={next => patch({ simpleNationalAssessment: next as NfseModelPeopleOptionsV2['simpleNationalAssessment'] })} />}
      </div>
      <IssuerDetails details={issuerDetails} />
    </section>
    {afterIssuer}
    {includeIbsCbs === true && <section className="nfse-model-section">
      <h3>Regra de destino do serviço</h3>
      <Choice id={`${prefix}-destination-same`} label="O destinatário é o próprio tomador?"
        value={value.recipientIsDestination === null ? '' : value.recipientIsDestination ? 'YES' : 'NO'}
        options={[{ value: 'YES', label: 'Sim' }, { value: 'NO', label: 'Não · informar destinatário na emissão' }]}
        onChange={next => patch({ recipientIsDestination: next === 'YES', destinationSource: next === 'YES' ? null : 'AT_ISSUANCE' })} />
      {governmentPurchase === true && <p className="nfse-model-help">O cadastro do adquirente será conferido como nacional ao preparar a compra governamental.</p>}
    </section>}
    <section className="nfse-model-section">
      <h3>Intermediação</h3>
      <Choice id={`${prefix}-intermediary-source`} label="Este modelo será usado em serviço com intermediário?"
        value={value.intermediarySource}
        options={[{ value: 'NONE', label: 'Não' }, { value: 'AT_ISSUANCE', label: 'Sim · informar intermediário na emissão' }]}
        onChange={next => patch({ intermediarySource: next as NfseModelPeopleOptionsV2['intermediarySource'] })} />
    </section>
  </fieldset>;
}
