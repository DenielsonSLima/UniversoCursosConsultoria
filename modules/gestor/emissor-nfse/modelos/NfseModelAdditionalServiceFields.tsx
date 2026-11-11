import React from 'react';
import { AdditionalRuleField, AdditionalText, AdditionalTextList, type AdditionalProps } from './additional/NfseAdditionalControls';
import { NfseAdditionalConstruction, NfseAdditionalEvent, NfseAdditionalProperty } from './additional/NfseAdditionalPlaces';
import NfseAdditionalForeignTrade from './additional/NfseAdditionalForeignTrade';
import { createDefaultNfseModelAdditionalOptions } from './services/nfse-model-additional-options';
import { nfseAdditionalScenario } from './services/nfse-model-additional-validation';

export default function NfseModelAdditionalServiceFields(props: AdditionalProps) {
  const { value, onChange, context, disabled = false } = props;
  if (!value) return <section className="nfse-model-section"><h3>Campos adicionais do serviço</h3>
    <button type="button" disabled={disabled} className="nfse-button nfse-button-secondary" onClick={() => onChange(createDefaultNfseModelAdditionalOptions())}>Configurar campos adicionais</button></section>;
  const patch = (change: Partial<typeof value.service>) => onChange({ ...value, service: { ...value.service, ...change } });
  const scenario = nfseAdditionalScenario(context, value);
  const simple = context.peopleOptions?.simpleNationalOption === 'FROM_ESTABLISHMENT' ? context.issuerSimpleNationalOption : context.peopleOptions?.simpleNationalOption;
  return <fieldset disabled={disabled} className="nfse-model-fields">
    <section className="nfse-model-section"><h3>Identificação complementar do serviço</h3><div className="nfse-model-grid">
      {simple !== '2' && <><AdditionalRuleField<string> label="Código complementar municipal" allowFixed={false} value={value.service.municipalServiceCode} onChange={municipalServiceCode => patch({ municipalServiceCode })} createFixed={() => ''}>
        {(code, update) => <AdditionalText label="Código complementar municipal" maxLength={3} value={code} onChange={update} />}
      </AdditionalRuleField>{value.service.municipalServiceCode?.source === 'FIXED' && <p className="nfse-wide" role="alert">Código municipal salvo: {value.service.municipalServiceCode.value}. Altere a origem para concluir; este código foi preservado para conferência.</p>}<p className="nfse-wide nfse-portal-note">O catálogo municipal autorizado ainda não está disponível. Escolha não informar ou definir na emissão; a seleção fixa depende dessa fonte oficial.</p></>}
      <AdditionalRuleField<string> label="Código interno do contribuinte" value={value.service.internalContributorCode} onChange={internalContributorCode => patch({ internalContributorCode })} createFixed={() => ''}>
        {(code, update) => <AdditionalText label="Código interno do contribuinte" maxLength={20} value={code} onChange={update} />}
      </AdditionalRuleField>
    </div></section>
    <NfseAdditionalProperty {...props} /><NfseAdditionalConstruction {...props} /><NfseAdditionalEvent {...props} /><NfseAdditionalForeignTrade {...props} />
    {scenario.references && <section className="nfse-model-section"><h3>NFS-e referenciadas pela operação</h3><div className="nfse-model-grid">
      {context.peopleOptions?.version === 2
        ? <p className="nfse-wide nfse-portal-note">As NFS-e com fornecimento ou pagamento anterior serão escolhidas individualmente ao preparar a emissão.</p>
        : <AdditionalRuleField<string[]> label="NFS-e com fornecimento ou pagamento já realizado" optional={false} value={value.service.operationReferences} onChange={operationReferences => patch({ operationReferences })} createFixed={() => []}>
          {(keys, update) => <AdditionalTextList label="Chave da NFS-e" maxLength={50} values={keys} onChange={update} />}
        </AdditionalRuleField>}
    </div></section>}
    <section className="nfse-model-section"><h3>Itens do pedido ou ordem de serviço</h3><div className="nfse-model-grid">
      <AdditionalRuleField<string[]> label="Itens do pedido" value={value.service.orderItems} onChange={orderItems => patch({ orderItems })} createFixed={() => []}>
        {(items, update) => <AdditionalTextList label="Item do pedido" maxLength={60} values={items} onChange={update} />}
      </AdditionalRuleField>
      <p className="nfse-wide nfse-portal-note">Os itens correspondem ao pedido, ordem ou projeto informado nos campos complementares do serviço.</p>
    </div></section>
  </fieldset>;
}
