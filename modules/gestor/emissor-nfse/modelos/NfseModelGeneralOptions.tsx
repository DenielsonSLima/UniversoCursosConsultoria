import React from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import type { NfseModelServiceOptions } from './services/nfse-model-service-options';
import { emptyNfseModelServiceOptions } from './nfse-model-options-form';
import { NfseRequiredMark } from './NfseModelServiceFields';

interface Props {
  value: NfseModelServiceOptions | null | undefined;
  onChange: (options: NfseModelServiceOptions) => void;
  section: 'ibs' | 'government';
}

const entityTypes = [
  { value: '1', label: 'União' },
  { value: '2', label: 'Estado' },
  { value: '3', label: 'Distrito Federal' },
  { value: '4', label: 'Município' },
] as const;

export default function NfseModelGeneralOptions({ value, onChange, section }: Props) {
  const options = value || emptyNfseModelServiceOptions();
  if (section === 'government' && options.includeIbsCbs !== true) return null;
  return <section className="nfse-model-section" aria-labelledby={`nfse-model-${section}-heading`}>
    <h3 id={`nfse-model-${section}-heading`}>{section === 'ibs' ? 'Informações de IBS e CBS' : 'Compra governamental'}</h3>
    <div className="nfse-model-grid">
      {section === 'ibs' && <fieldset className="nfse-model-choices nfse-wide">
        <legend>Deseja incluir informações de IBS e CBS?<NfseRequiredMark /></legend>
        <div className="nfse-model-radio-group">
          <label><input type="radio" name="nfse-model-ibs-cbs" required checked={options.includeIbsCbs === false}
            onChange={() => onChange({ ...options, includeIbsCbs: false, governmentPurchase: null, governmentEntityType: null, operationType: null })} />Não</label>
          <label><input type="radio" name="nfse-model-ibs-cbs" required checked={options.includeIbsCbs === true}
            onChange={() => onChange({ ...options, includeIbsCbs: true })} />Sim</label>
        </div>
      </fieldset>}
      {section === 'government' && <fieldset className="nfse-model-choices nfse-wide">
        <legend>Trata-se de compra governamental?<NfseRequiredMark /></legend>
        <div className="nfse-model-radio-group">
          <label><input type="radio" name="nfse-model-government" required checked={options.governmentPurchase === false}
            onChange={() => onChange({ ...options, governmentPurchase: false, governmentEntityType: null })} />Não</label>
          <label><input type="radio" name="nfse-model-government" required checked={options.governmentPurchase === true}
            onChange={() => onChange({ ...options, governmentPurchase: true })} />Sim</label>
        </div>
      </fieldset>}
      {section === 'government' && options.governmentPurchase === true && <div className="nfse-field">
        <label htmlFor="nfse-model-government-entity">Tipo de ente governamental<NfseRequiredMark /></label>
        <InstitutionalSelect id="nfse-model-government-entity" ariaLabel="Tipo de ente governamental" required
          value={options.governmentEntityType || ''} options={entityTypes}
          onValueChange={value => {
            const selected = entityTypes.find(option => option.value === value);
            if (selected) onChange({ ...options, governmentEntityType: selected.value });
          }} />
      </div>}
    </div>
  </section>;
}
