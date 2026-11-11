import React from 'react';
import type { NfseScope } from '../types/nfse.types';
import { isNfseScopeValid } from '../types/nfse.scope';
import { useNfseModelIssuerMetadata } from './hooks/useNfseModelIssuerMetadata';
import NfseModelPeopleFields from './NfseModelPeopleFields';

type FieldsProps = React.ComponentProps<typeof NfseModelPeopleFields>;
interface Props extends Pick<FieldsProps, 'value' | 'onChange' | 'includeIbsCbs' | 'governmentPurchase' | 'afterIssuer' | 'disabled'> {
  scope: NfseScope | null;
}

const simpleLabels = { '1': 'Não optante', '2': 'Optante · MEI', '3': 'Optante · ME/EPP' } as const;
const assessmentLabels = { '1': 'Tributos federais e ISSQN no Simples Nacional',
  '2': 'Federais no Simples; ISSQN conforme legislação municipal',
  '3': 'Federais e ISSQN fora do Simples Nacional' } as const;
const specialLabels = { '0': 'Nenhum', '1': 'Ato cooperado', '2': 'Estimativa', '3': 'Microempresa municipal',
  '4': 'Notário ou registrador', '5': 'Profissional autônomo', '6': 'Sociedade de profissionais', '9': 'Outros' } as const;

function ConfiguredPeopleFields({ scope, ...props }: FieldsProps & { scope: NfseScope }) {
  const configuration = useNfseModelIssuerMetadata(scope);
  const issuer = configuration.data;
  const unavailable = configuration.isPending ? 'Consultando configuração da unidade…' : 'Cadastro do estabelecimento';
  const details = [
    { label: 'CNPJ', value: issuer?.cnpj || unavailable },
    { label: 'Município', value: issuer ? [issuer.address.city, issuer.address.state].filter(Boolean).join(' / ') || issuer.municipalityCode || 'Não informado' : unavailable },
    { label: 'Nome cadastrado', value: issuer ? issuer.name || 'Não informado' : unavailable },
    { label: 'Inscrição municipal', value: issuer ? issuer.municipalRegistration || 'Não informada' : unavailable },
    { label: 'Razão Social', value: issuer ? issuer.legalName || 'Não informada no cadastro desta unidade' : unavailable },
    { label: 'Telefone', value: issuer ? issuer.phone || 'Não informado' : unavailable },
    { label: 'E-mail', value: issuer ? issuer.email || 'Não informado' : unavailable },
    { label: 'CEP', value: issuer ? issuer.address.postalCode || 'Não informado' : unavailable },
    { label: 'Bairro', value: issuer ? issuer.address.district || 'Não informado' : unavailable },
    { label: 'Logradouro', value: issuer ? issuer.address.street || 'Não informado' : unavailable },
    { label: 'Número', value: issuer ? issuer.address.number || 'Não informado' : unavailable },
    { label: 'Complemento', value: issuer ? issuer.address.complement || 'Não informado' : unavailable },
    { label: 'Regime especial de tributação', value: issuer ? issuer.regEspTrib ? specialLabels[issuer.regEspTrib] : 'Não informado' : unavailable },
    { label: 'Opção pelo Simples Nacional', value: issuer ? issuer.opSimpNac ? simpleLabels[issuer.opSimpNac] : 'Não informada' : unavailable },
    { label: 'Apuração tributária do Simples', value: issuer ? issuer.regApTribSN ? assessmentLabels[issuer.regApTribSN] : 'Não informada' : unavailable },
  ];
  return <>
    {configuration.error && <div className="nfse-notice" role="alert">
      <span>Não foi possível consultar os dados atuais da unidade.</span>
      <button type="button" className="nfse-button nfse-button-secondary" onClick={() => { void configuration.refetch(); }}>Tentar novamente</button>
    </div>}
    <NfseModelPeopleFields {...props} issuerDetails={details} />
  </>;
}

export default function NfseModelPeopleStep({ scope, ...props }: Props) {
  return isNfseScopeValid(scope) ? <ConfiguredPeopleFields {...props} scope={scope} /> : <NfseModelPeopleFields {...props} />;
}
