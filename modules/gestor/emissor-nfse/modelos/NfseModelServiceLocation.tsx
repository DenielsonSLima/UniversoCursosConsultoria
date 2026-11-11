import React from 'react';
import type { NfseModelServiceOptions } from './services/nfse-model-service-options';
import { emptyNfseModelServiceOptions } from './nfse-model-options-form';
import NfseModelLocationPicker from './NfseModelLocationPicker';

interface Props {
  value: NfseModelServiceOptions | null | undefined;
  onChange: (options: NfseModelServiceOptions) => void;
}

export default function NfseModelServiceLocation({ value, onChange }: Props) {
  const options = value || emptyNfseModelServiceOptions();
  return <section className="nfse-model-section" aria-labelledby="nfse-model-location-heading">
    <h3 id="nfse-model-location-heading">Local do fornecimento/prestação do serviço</h3>
    <div className="nfse-model-grid">
      <NfseModelLocationPicker id="nfse-model-country" label="País" kind="country" value={options.countryCode}
        selectedLabel={options.countryLabel} onChange={selected => onChange({ ...options, countryCode: selected.value,
          countryLabel: selected.label, municipalityCode: null, municipalityLabel: null })} />
      {options.countryCode === 'BRA' && <NfseModelLocationPicker id="nfse-model-municipality" label="Município" kind="municipality"
        value={options.municipalityCode || ''} selectedLabel={options.municipalityLabel}
        onChange={selected => onChange({ ...options, municipalityCode: selected.value, municipalityLabel: selected.label })} />}
    </div>
  </section>;
}
