import React from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { NfseValuesChoice, NfseValuesDecimalField } from './NfseModelAmountRuleField';
import NfseModelDocumentRules from './NfseModelDocumentRules';
import type { NfseModelValuesOptions, NfseValuesCatalogs, NfseValuesContext } from './services/nfse-model-values.types';
import { isNfseClassificationEligible, isNfseCreditEligible } from './services/nfse-model-values-validation';

type Ibs = NonNullable<NfseModelValuesOptions['ibscbs']>;
export default function NfseModelIbsCbsValues({ id, value, onChange, context, catalogs, loading, error, onRetry }: {
  id: string; value: NfseModelValuesOptions['ibscbs']; onChange: (value: NfseModelValuesOptions['ibscbs']) => void;
  context: NfseValuesContext; catalogs: NfseValuesCatalogs; loading: boolean; error: boolean; onRetry: () => void;
}) {
  if (context.includeIbsCbs !== true) return value ? <section className="nfse-model-section"><h3>IBS e CBS</h3>
    <p role="alert">O modelo contém regras de IBS/CBS, mas essas informações estão desativadas na Configuração.</p>
    <button type="button" className="nfse-button nfse-button-secondary" onClick={() => onChange(null)}>Remover regras de IBS/CBS</button></section> : null;
  const current: Ibs = value || { cst: '', classificationCode: '', presumedCreditCode: null, regularTaxation: null, deferral: null, reimbursementDocuments: [] };
  const patch = (change: Partial<Ibs>) => onChange({ ...current, ...change });
  const eligible = catalogs.classifications.filter(row => isNfseClassificationEligible(row, context.competenceDate));
  const csts = [...new Map(eligible.map(row => [row.cst, { value: row.cst, label: `${row.cst} · ${row.cstName}` }])).values()];
  const classification = eligible.find(row => row.cst === current.cst && row.classificationCode === current.classificationCode);
  const credits = catalogs.credits.filter(row => isNfseCreditEligible(row, context.competenceDate));
  return <section className="nfse-model-section"><h3>IBS e CBS</h3>
    <p className="nfse-portal-note">Escolha a classificação confirmada para a operação. As alíquotas, reduções e valores serão resolvidos na emissão pela regra vigente.</p>
    <fieldset disabled={loading || error} className="nfse-model-fields"><div className="nfse-model-grid">
      <NfseValuesChoice id={`${id}-cst`} label="Situação tributária IBS/CBS" value={current.cst} options={csts}
        onChange={next => patch({ cst: next, classificationCode: '', presumedCreditCode: null, regularTaxation: null, deferral: null })} />
      <div className="nfse-field"><label htmlFor={`${id}-class`}>Classificação tributária IBS/CBS *</label>
        <InstitutionalSelect id={`${id}-class`} ariaLabel="Classificação tributária IBS/CBS" required value={current.classificationCode}
          options={eligible.filter(row => row.cst === current.cst).map(row => ({ value: row.classificationCode, label: `${row.classificationCode} · ${row.name}` }))}
          onValueChange={next => {
            const selected = eligible.find(row => row.classificationCode === next && row.cst === current.cst);
            if (!selected) return;
            patch({ classificationCode: next, presumedCreditCode: null,
              regularTaxation: selected.classificationFlags.IndTribRegular ? { cst: '', classificationCode: '' } : null,
              deferral: selected.flags.IndDiferimento ? { statePercent: '', municipalPercent: '', cbsPercent: '' } : null });
          }} /></div>
      {classification && <p className="nfse-wide nfse-portal-note">{classification.name}</p>}
      {classification?.classificationFlags.IndPermiteCredPres === true && <>
        <NfseValuesChoice id={`${id}-credit`} label="Crédito presumido" value={current.presumedCreditCode || 'NONE'}
          options={[{ value: 'NONE', label: 'Não informar crédito presumido' }, ...credits.map(row => ({ value: row.code, label: `${row.code} · ${row.name}` }))]}
          onChange={next => patch({ presumedCreditCode: next === 'NONE' ? null : next })} />
        {credits.length === 0 && <small className="nfse-wide">Não há crédito presumido elegível para informar diretamente nesta nota na competência selecionada. Créditos apropriados por evento seguem seu procedimento próprio.</small>}
      </>}
      {current.regularTaxation && <>
        <NfseValuesChoice id={`${id}-regular-cst`} label="Situação tributária regular IBS/CBS" value={current.regularTaxation.cst} options={csts}
          onChange={next => patch({ regularTaxation: { cst: next, classificationCode: '' } })} />
        <NfseValuesChoice id={`${id}-regular-class`} label="Classificação tributária regular" value={current.regularTaxation.classificationCode}
          options={eligible.filter(row => row.cst === current.regularTaxation?.cst).map(row => ({ value: row.classificationCode, label: `${row.classificationCode} · ${row.name}` }))}
          onChange={next => patch({ regularTaxation: { cst: current.regularTaxation!.cst, classificationCode: next } })} />
      </>}
      {current.deferral && (['statePercent', 'municipalPercent', 'cbsPercent'] as const).map((key, index) => <div className="nfse-field" key={key}><NfseValuesDecimalField
        id={`${id}-${key}`} label={['Diferimento IBS estadual (%)', 'Diferimento IBS municipal (%)', 'Diferimento CBS (%)'][index]} kind="PERCENT"
        value={current.deferral![key] || null} onChange={next => patch({ deferral: { ...current.deferral!, [key]: next || '' } })} /></div>)}
      <div className="nfse-wide"><h4>Reembolso, repasse ou ressarcimento documentado</h4>
        <NfseModelDocumentRules id={`${id}-reimbursements`} value={current.reimbursementDocuments} purpose="reimbursement" profile={context.profile}
          onChange={next => patch({ reimbursementDocuments: next })} /></div>
    </div></fieldset>
    {loading && <p role="status">Carregando classificações tributárias…</p>}
    {error && <div role="alert"><p>Não foi possível carregar as classificações tributárias.</p><button type="button" className="nfse-button nfse-button-secondary" onClick={onRetry}>Tentar novamente</button></div>}
    {!loading && !error && eligible.length === 0 && <p role="alert">Não há classificações disponíveis para esta competência. Confira a data e o catálogo antes de salvar.</p>}
  </section>;
}
