import React from 'react';
import NfseModelAmountRuleField, { NfseValuesChoice, NfseValuesDecimalField } from './NfseModelAmountRuleField';
import { noNfseAmount } from './services/nfse-model-values-rules';
import { nfsePisCofinsCsts } from './services/nfse-model-values-tax-groups';
import type { NfseModelValuesOptions, NfseValuesContext } from './services/nfse-model-values.types';

const cstNames = ['Nenhum', 'Tributável com alíquota básica', 'Tributável com alíquota diferenciada', 'Tributável por unidade de medida',
  'Monofásica · revenda a alíquota zero', 'Substituição tributária', 'Alíquota zero', 'Isenta', 'Sem incidência', 'Suspensão', 'Outras saídas',
  'Crédito · receita tributada interna', 'Crédito · receita não tributada interna', 'Crédito · exportação', 'Crédito · tributadas e não tributadas internas',
  'Crédito · tributadas internas e exportação', 'Crédito · não tributadas internas e exportação', 'Crédito · tributadas e não tributadas internas e exportação',
  'Presumido · receita tributada interna', 'Presumido · receita não tributada interna', 'Presumido · exportação',
  'Presumido · tributadas e não tributadas internas', 'Presumido · tributadas internas e exportação', 'Presumido · não tributadas internas e exportação',
  'Presumido · tributadas e não tributadas internas e exportação', 'Outros créditos presumidos', 'Aquisição sem crédito', 'Aquisição com isenção',
  'Aquisição com suspensão', 'Aquisição a alíquota zero', 'Aquisição sem incidência', 'Aquisição por substituição tributária', 'Outras entradas', 'Outras operações'];
const retentionChoices = [
  { value: '0', label: 'PIS, COFINS e CSLL não retidos' }, { value: '1', label: 'PIS/COFINS retidos · domínio legado' },
  { value: '2', label: 'PIS/COFINS não retidos · domínio legado' }, { value: '3', label: 'PIS, COFINS e CSLL retidos' },
  { value: '4', label: 'PIS/COFINS retidos; CSLL não' }, { value: '5', label: 'PIS retido; COFINS e CSLL não' },
  { value: '6', label: 'COFINS retida; PIS e CSLL não' }, { value: '7', label: 'PIS não; COFINS e CSLL retidas' },
  { value: '8', label: 'PIS/COFINS não; CSLL retida' }, { value: '9', label: 'COFINS não; PIS e CSLL retidos' },
];
export default function NfseModelFederalValues({ id, value, onChange, context }: {
  id: string; value: NfseModelValuesOptions['federal']; onChange: (value: NfseModelValuesOptions['federal']) => void;
  context: NfseValuesContext;
}) {
  const locked = context.simpleNationalOption === '2'
    || (context.simpleNationalOption === '3' && ['1', '2'].includes(context.simpleNationalAssessment || ''));
  const patch = (change: Partial<typeof value>) => onChange({ ...value, ...change });
  const inherit = () => onChange({ mode: 'FROM_ESTABLISHMENT', pisCofinsCst: null, base: noNfseAmount(),
    pisRatePercent: null, cofinsRatePercent: null, retentionType: null,
    withheldCp: noNfseAmount(), withheldIrrf: noNfseAmount(), withheldSocialContributions: noNfseAmount() });
  return <section className="nfse-model-section"><h3>Tributação federal</h3><div className="nfse-model-grid">
    <NfseValuesChoice id={`${id}-mode`} label="Origem dos tributos federais" value={value.mode}
      options={[{ value: 'FROM_ESTABLISHMENT', label: 'Usar enquadramento confirmado da unidade' }, { value: 'EXPLICIT', label: 'Configurar PIS/COFINS e retenções', disabled: locked }]}
      onChange={next => next === 'FROM_ESTABLISHMENT' ? inherit() : patch({ mode: 'EXPLICIT' })} />
    {(locked || value.mode === 'FROM_ESTABLISHMENT') && <p className="nfse-wide nfse-portal-note">Os tributos federais serão resolvidos pelo enquadramento confirmado da unidade na emissão.{locked ? ' Neste enquadramento, as alíquotas federais não são preenchidas livremente.' : ''}</p>}
    {locked && value.mode === 'EXPLICIT' && <div className="nfse-wide" role="alert"><p>A configuração explícita não é compatível com o enquadramento atual.</p>
      <button type="button" className="nfse-button nfse-button-secondary" onClick={inherit}>Usar enquadramento da unidade</button></div>}
  </div>
    {value.mode === 'EXPLICIT' && <fieldset disabled={locked} className="nfse-model-fields"><div className="nfse-model-grid">
      <NfseValuesChoice id={`${id}-cst`} label="Situação tributária de PIS/COFINS" value={value.pisCofinsCst || 'NOT_INFORMED'} required={false}
        options={[{ value: 'NOT_INFORMED', label: 'Não informar PIS/COFINS' }, ...nfsePisCofinsCsts.map((code, index) => ({ value: code, label: `${code} · ${cstNames[index]}` }))]}
        onChange={next => patch({ pisCofinsCst: next === 'NOT_INFORMED' ? null : next,
          base: noNfseAmount(), pisRatePercent: null, cofinsRatePercent: null, retentionType: null,
          ...(next === 'NOT_INFORMED' ? { withheldSocialContributions: noNfseAmount() } : {}) })} />
      {value.pisCofinsCst !== null && <>
      <NfseModelAmountRuleField id={`${id}-base`} label="Base de cálculo PIS/COFINS" value={value.base}
        onChange={next => patch({ base: next })} help="A base e as alíquotas dependem da situação tributária. Não informar quando vedado pelo enquadramento." />
      <NfseValuesDecimalField id={`${id}-pis`} label="Alíquota PIS (%)" kind="PERCENT" required={false} value={value.pisRatePercent}
        onChange={next => patch({ pisRatePercent: next })} />
      <NfseValuesDecimalField id={`${id}-cofins`} label="Alíquota COFINS (%)" kind="PERCENT" required={false} value={value.cofinsRatePercent}
        onChange={next => patch({ cofinsRatePercent: next })} />
      <NfseValuesChoice id={`${id}-retention`} label="Retenção de PIS/COFINS/CSLL" value={value.retentionType} options={retentionChoices}
        onChange={next => patch({ retentionType: next as typeof value.retentionType,
          ...(next === '0' ? { withheldSocialContributions: noNfseAmount() } : {}) })} />
      </>}
      <NfseModelAmountRuleField id={`${id}-cp`} label="Retenção previdenciária · CP" value={value.withheldCp} onChange={next => patch({ withheldCp: next })} />
      <NfseModelAmountRuleField id={`${id}-irrf`} label="Retenção IRRF" value={value.withheldIrrf} onChange={next => patch({ withheldIrrf: next })} />
      {(value.pisCofinsCst !== null || value.withheldSocialContributions.source !== 'NONE') && <NfseModelAmountRuleField id={`${id}-social`} label="Contribuições sociais retidas" value={value.withheldSocialContributions}
        onChange={next => patch({ withheldSocialContributions: next })}
        help="A composição depende do tipo de retenção selecionado. PIS/COFINS já incluídos nesse total não serão descontados novamente." />}
    </div></fieldset>}
  </section>;
}
