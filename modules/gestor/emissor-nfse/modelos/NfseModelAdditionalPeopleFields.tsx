import React from 'react';
import type { NfsePeoplePartnerLookup } from './NfseModelPeopleFields';
import { AdditionalChoice, type AdditionalProps } from './additional/NfseAdditionalControls';
import { createDefaultNfseModelAdditionalOptions } from './services/nfse-model-additional-options';
import { nfseAdditionalScenario } from './services/nfse-model-additional-validation';

// Lookup remains a compatible prop while the parent removes historical participant queries.
export default function NfseModelAdditionalPeopleFields({ value, onChange, context, disabled = false }:
  AdditionalProps & { providerLookup?: NfsePeoplePartnerLookup }) {
  if (!value) return <section className="nfse-model-section"><h3>Regras adicionais de pessoas</h3>
    <button type="button" disabled={disabled} className="nfse-button nfse-button-secondary"
      onClick={() => onChange(createDefaultNfseModelAdditionalOptions())}>Configurar regras adicionais</button></section>;
  const people = value.people, scenario = nfseAdditionalScenario(context, value);
  const patch = (change: Partial<typeof people>) => onChange({ ...value, people: { ...people, ...change } });
  return <fieldset disabled={disabled} className="nfse-model-fields">
    {scenario.ibs && <section className="nfse-model-section"><h3>Uso ou consumo pessoal</h3>
      <AdditionalChoice label="A operação é de uso ou consumo pessoal?" value={people.personalUse === null ? 'NOT_INFORMED' : people.personalUse ? 'YES' : 'NO'}
        options={[{ value: 'NOT_INFORMED', label: 'Não informar' }, { value: 'NO', label: 'Não' }, { value: 'YES', label: 'Sim' }]}
        onChange={next => patch({ personalUse: next === 'NOT_INFORMED' ? null : next === 'YES' })} /></section>}
    {!scenario.provider && <section className="nfse-model-section"><h3>Regra da emissão por tomador/intermediário</h3>
      <AdditionalChoice label="Motivo da emissão pelo tomador/intermediário" value={people.emissionReason}
        options={[{ value: '1', label: 'Importação de serviço' }, { value: '2', label: 'Obrigação por legislação municipal' },
          { value: '3', label: 'Recusa de emissão pelo prestador' }, { value: '4', label: 'Rejeição da nota emitida pelo prestador' }]}
        onChange={next => patch({ emissionReason: next as typeof people.emissionReason,
          rejectedInvoiceReference: next === '4' ? { source: 'AT_ISSUANCE', value: null } : null })} />
      <p className="nfse-portal-note">O prestador será escolhido na operação. Documento, localização, NIF, contatos e endereço virão do cadastro correspondente.</p>
      {people.emissionReason === '4' && <p className="nfse-portal-note">A NFS-e rejeitada será informada individualmente ao preparar a emissão.</p>}
    </section>}
  </fieldset>;
}
