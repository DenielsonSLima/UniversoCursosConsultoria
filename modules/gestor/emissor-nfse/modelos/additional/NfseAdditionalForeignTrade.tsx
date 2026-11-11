import React, { useId } from 'react';
import { AdditionalChoice, AdditionalRuleField, AdditionalText, type AdditionalProps } from './NfseAdditionalControls';
import { NfseValuesDecimalField } from '../NfseModelAmountRuleField';
import { nfseAdditionalScenario } from '../services/nfse-model-additional-validation';
import { nfseCurrencyOptions, nfseProviderSupportOptions, nfseRecipientSupportOptions, nfseProvisionModeOptions, nfseRelationshipOptions } from '../services/nfse-model-additional.domains';

export default function NfseAdditionalForeignTrade({ value, onChange, context }: AdditionalProps) {
  const id = useId(), scenario = nfseAdditionalScenario(context, value);
  if (!value || (!scenario.foreignTrade && !scenario.conditionalForeignTrade)) return null;
  const trade = value.service.foreignTrade;
  const update = (next: typeof trade) => onChange({ ...value, service: { ...value.service, foreignTrade: next } });
  if (!trade) return <section className="nfse-model-section"><h3>Informações para comércio exterior</h3>
    <p className="nfse-portal-note">A aplicação deste grupo será conferida na emissão pelo local da prestação, tratamento do serviço e cadastros das partes.</p>
    <button type="button" className="nfse-button nfse-button-secondary" onClick={() => update({ provisionMode: null, relationship: null, currencyCode: '',
      serviceAmount: { source: 'AT_ISSUANCE', value: null }, providerSupport: null, recipientSupport: null, temporaryGoods: null,
      importDeclaration: null, exportRegistration: null, shareWithMdic: null })}>Configurar comércio exterior</button>
  </section>;
  const patch = (change: Partial<typeof trade>) => update({ ...trade, ...change });
  return <section className="nfse-model-section"><h3>Informações para comércio exterior</h3><div className="nfse-model-grid">
    <AdditionalChoice label="Modo de prestação no comércio exterior" value={trade.provisionMode} options={nfseProvisionModeOptions} onChange={next => patch({ provisionMode: next as typeof trade.provisionMode })} />
    <AdditionalChoice label="Vínculo entre as partes no negócio" value={trade.relationship} options={nfseRelationshipOptions} onChange={next => patch({ relationship: next as typeof trade.relationship })} />
    <AdditionalChoice label="Moeda da transação (Banco Central)" value={trade.currencyCode} options={nfseCurrencyOptions} onChange={currencyCode => patch({ currencyCode })} />
    <AdditionalRuleField<string> label="Valor do serviço em moeda estrangeira" optional={false} value={trade.serviceAmount}
      onChange={next => { if (next) patch({ serviceAmount: next }); }} createFixed={() => ''}>
      {(amount, change) => <NfseValuesDecimalField id={`${id}-amount`} label="Valor do serviço em moeda estrangeira" value={amount || null} onChange={change} />}
    </AdditionalRuleField>
    <AdditionalChoice label="Apoio/fomento utilizado pelo prestador" value={trade.providerSupport} options={nfseProviderSupportOptions} onChange={next => patch({ providerSupport: next as typeof trade.providerSupport })} />
    <AdditionalChoice label="Apoio/fomento utilizado pelo tomador" value={trade.recipientSupport} options={nfseRecipientSupportOptions} onChange={recipientSupport => patch({ recipientSupport })} />
    <AdditionalChoice label="Vínculo à movimentação temporária de bens" value={trade.temporaryGoods}
      options={[{ value: '1', label: 'Não vinculada' }, { value: '2', label: 'Vinculada à declaração de importação' }, { value: '3', label: 'Vinculada ao registro de exportação' }]}
      onChange={next => patch({ temporaryGoods: next as typeof trade.temporaryGoods,
        importDeclaration: scenario.operationParties && next === '2' ? { source: 'AT_ISSUANCE', value: null } : null,
        exportRegistration: scenario.operationParties && next === '3' ? { source: 'AT_ISSUANCE', value: null } : null })} />
    {trade.temporaryGoods === '2' && (scenario.operationParties
      ? <p className="nfse-wide nfse-portal-note">O número da declaração de importação averbada será informado na emissão.</p> : <AdditionalRuleField<string> label="Declaração de importação averbada" optional={false} value={trade.importDeclaration} onChange={importDeclaration => patch({ importDeclaration })} createFixed={() => ''}>
      {(declaration, change) => <AdditionalText label="Número DI/DSI/DA/DRI-E" maxLength={12} value={declaration} onChange={change} />}
    </AdditionalRuleField>)}
    {trade.temporaryGoods === '3' && (scenario.operationParties
      ? <p className="nfse-wide nfse-portal-note">O número do registro de exportação averbado será informado na emissão.</p> : <AdditionalRuleField<string> label="Registro de exportação averbado" optional={false} value={trade.exportRegistration} onChange={exportRegistration => patch({ exportRegistration })} createFixed={() => ''}>
      {(registration, change) => <AdditionalText label="Número do RE averbado" maxLength={12} value={registration} onChange={change} />}
    </AdditionalRuleField>)}
    <AdditionalChoice label="Compartilhar a NFS-e com o MDIC?" value={trade.shareWithMdic === null ? '' : trade.shareWithMdic ? 'YES' : 'NO'}
      options={[{ value: 'NO', label: 'Não' }, { value: 'YES', label: 'Sim' }]} onChange={next => patch({ shareWithMdic: next === 'YES' })} />
    {!scenario.foreignTrade && <p className="nfse-wide nfse-portal-note">Os participantes serão definidos na operação. Este grupo será aplicado quando o cenário resolvido exigir comércio exterior.</p>}
  </div></section>;
}
