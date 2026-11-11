import React from 'react';
import NfseModelAmountRuleField, { NfseValuesChoice, NfseValuesDecimalField } from './NfseModelAmountRuleField';
import NfseModelDocumentRules from './NfseModelDocumentRules';
import type { NfseModelValuesDraft, NfseValuesContext } from './services/nfse-model-values.types';
import { noNfseAmount } from './services/nfse-model-values-rules';

export default function NfseModelMunicipalValues({ id, value, onChange, context }: {
  id: string; value: NfseModelValuesDraft; onChange: (value: NfseModelValuesDraft) => void;
  context: NfseValuesContext;
}) {
  const iss = value.iss;
  const patch = (change: Partial<NfseModelValuesDraft['iss']>) => onChange({ ...value, iss: { ...iss, ...change } });
  const inheritedRate = context.simpleNationalOption === '3' && context.simpleNationalAssessment === '1' && iss.retention === 'NONE';
  const retentionAllowed = context.issTreatment === 'TRIBUTAVEL' && context.simpleNationalOption !== '2' && iss.suspensionType === 'NONE';
  return <section className="nfse-model-section"><h3>Tributação municipal · ISSQN</h3>
    <div className="nfse-model-grid">
      <label className="nfse-field"><span>Tributação do serviço</span><input readOnly value={context.issTreatment === 'TRIBUTAVEL' ? 'Tributável' : context.issTreatment === 'IMUNIDADE' ? 'Imunidade'
        : context.issTreatment === 'EXPORTACAO' ? 'Exportação de serviço' : context.issTreatment === 'NAO_INCIDENCIA' ? 'Não incidência' : 'Defina na etapa Serviço'} /></label>
      <NfseValuesChoice id={`${id}-regime`} label="Regime especial de tributação" value={iss.specialTaxRegime}
        options={[{ value: 'FROM_ESTABLISHMENT', label: 'Usar regime confirmado da unidade' }, { value: '0', label: 'Nenhum' },
          { value: '1', label: 'Ato cooperado' }, { value: '2', label: 'Estimativa' }, { value: '3', label: 'Microempresa municipal' },
          { value: '4', label: 'Notário ou registrador' }, { value: '5', label: 'Profissional autônomo' }, { value: '6', label: 'Sociedade de profissionais' }, { value: '9', label: 'Outros' }]}
        onChange={next => patch({ specialTaxRegime: next as typeof iss.specialTaxRegime })} />
      <NfseValuesChoice id={`${id}-suspension`} label="A exigibilidade do ISSQN está suspensa?" value={iss.suspensionType}
        options={[{ value: 'NONE', label: 'Não' }, { value: 'JUDICIAL', label: 'Sim · decisão judicial' }, { value: 'ADMINISTRATIVE', label: 'Sim · processo administrativo' }]}
        onChange={next => patch({ suspensionType: next as typeof iss.suspensionType, suspensionProcessNumber: null })} />
      {iss.suspensionType && iss.suspensionType !== 'NONE' && <label className="nfse-field"><span>Número do processo de suspensão *</span>
        <input required maxLength={30} value={iss.suspensionProcessNumber || ''} onChange={event => patch({ suspensionProcessNumber: event.target.value || null })} /></label>}
      <NfseValuesChoice id={`${id}-retention`} label="Retenção do ISSQN" value={iss.retention}
        options={[{ value: 'NONE', label: 'Não retido' }, { value: 'RECIPIENT', label: 'Retido pelo tomador', disabled: !retentionAllowed || !context.recipientAvailable },
          { value: 'INTERMEDIARY', label: 'Retido pelo intermediário', disabled: !retentionAllowed || !context.intermediaryAvailable }]}
        onChange={next => patch({ retention: next as typeof iss.retention })} />
      <NfseValuesChoice id={`${id}-rate-source`} label="Origem da alíquota ISSQN" value={iss.rateSource}
        options={[{ value: 'FROM_RULES', label: 'Resolver pelo enquadramento e parâmetros do município' }, { value: 'FIXED', label: 'Informar alíquota confirmada', disabled: inheritedRate || context.issTreatment !== 'TRIBUTAVEL' || context.simpleNationalOption === '2' }]}
        onChange={next => patch({ rateSource: next as typeof iss.rateSource, ratePercent: null })} />
      {iss.rateSource === 'FIXED' && <NfseValuesDecimalField id={`${id}-rate`} label="Alíquota ISSQN (%)" kind="PERCENT"
        value={iss.ratePercent} onChange={next => patch({ ratePercent: next })} />}
      {inheritedRate && <small className="nfse-wide">Na apuração integral do Simples sem retenção, a alíquota é resolvida na emissão e não é preenchida livremente.</small>}
      <NfseValuesChoice id={`${id}-benefit`} label="Aplicar benefício municipal?" value={iss.benefitId === null ? 'NO' : 'YES'}
        options={[{ value: 'NO', label: 'Não' }, { value: 'YES', label: 'Sim · selecionar benefício oficial', disabled: true }]}
        onChange={next => patch({ benefitId: next === 'YES' ? '' : null, benefitReduction: noNfseAmount() })} />
      <label className="nfse-field"><span>Identificação do benefício municipal</span><input readOnly
        value={iss.benefitId || ''} placeholder="Selecionar do catálogo oficial municipal" /></label>
      <small className="nfse-wide">A lista oficial de benefícios deste município está indisponível. Novos benefícios poderão ser selecionados quando a parametrização municipal estiver disponível.</small>
      {iss.benefitId !== null && <fieldset disabled className="nfse-wide nfse-model-fields">
        <p className="nfse-portal-note">O benefício salvo permanece visível para conferência. Para salvar agora, remova-o escolhendo Não; sua vigência ainda não foi confirmada na fonte municipal.</p>
        <NfseModelAmountRuleField id={`${id}-benefit-reduction`} label="Redução da base pelo benefício" value={iss.benefitReduction}
          base="SERVICE_AFTER_UNCONDITIONAL_AND_DEDUCTION" onChange={next => patch({ benefitReduction: next })}
          help="Somente benefícios que autorizem redução da base aceitam esta regra. A identificação e a vigência serão conferidas antes de emitir." />
      </fieldset>}
      <NfseValuesChoice id={`${id}-deduction`} label="Dedução ou redução da base de cálculo" value={value.deduction.mode}
        options={[{ value: 'NONE', label: 'Não aplicar' }, { value: 'FIXED', label: 'Valor fixo' }, { value: 'PERCENTAGE', label: 'Percentual' }, { value: 'DOCUMENTS', label: 'Documentos vinculados' }]}
        onChange={next => onChange({ ...value, deduction: { mode: next as typeof value.deduction.mode, value: null, documents: [] } })} />
      {['FIXED', 'PERCENTAGE'].includes(value.deduction.mode) && <NfseValuesDecimalField id={`${id}-deduction-value`}
        label={value.deduction.mode === 'FIXED' ? 'Valor da dedução (R$)' : 'Percentual de dedução'} kind={value.deduction.mode === 'FIXED' ? 'MONEY' : 'PERCENT'}
        value={value.deduction.value} onChange={next => onChange({ ...value, deduction: { ...value.deduction, value: next } })} />}
      {value.deduction.mode === 'DOCUMENTS' && <NfseModelDocumentRules id={`${id}-deduction-docs`} value={value.deduction.documents}
        purpose="deduction" profile={context.profile}
        onChange={next => onChange({ ...value, deduction: { ...value.deduction, documents: next } })} />}
    </div>
    <p className="nfse-portal-note">Benefícios, suspensão, deduções e retenções dependem da legislação, do município e da competência. A base e o valor do ISSQN serão calculados na emissão.</p>
  </section>;
}
