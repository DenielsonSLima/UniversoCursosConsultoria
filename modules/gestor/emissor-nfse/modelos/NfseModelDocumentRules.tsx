import React from 'react';
import { NfseValuesChoice, NfseValuesDecimalField } from './NfseModelAmountRuleField';
import type { NfseDocumentRule, NfseValuesContext } from './services/nfse-model-values.types';
import { nfseDocumentCategories } from './services/nfse-model-values-validation';

const documentTypes = [
  { value: 'NATIONAL_NFSE', label: 'NFS-e nacional' }, { value: 'NFE', label: 'NF-e' },
  { value: 'CTE', label: 'CT-e' }, { value: 'OTHER_NATIONAL_DFE', label: 'Outro documento fiscal eletrônico nacional' },
  { value: 'MUNICIPAL_NFSE', label: 'NFS-e municipal' }, { value: 'NF_NFS', label: 'Nota fiscal / nota de serviço' },
  { value: 'OTHER_FISCAL', label: 'Outro documento fiscal' }, { value: 'NON_FISCAL', label: 'Documento não fiscal' },
];
const deductionLabels: Record<string, string> = { '01': 'Alimentação, bebidas e frigobar', '02': 'Materiais',
  '03': 'Produção externa', '04': 'Reembolso de despesas', '05': 'Repasse consorciado',
  '06': 'Repasse de plano de saúde', '07': 'Serviços', '08': 'Subempreitada de mão de obra', '99': 'Outras deduções' };
const reimbursementLabels: Record<string, string> = { '01': 'Intermediação imobiliária', '02': 'Turismo',
  '03': 'Produção publicitária', '04': 'Mídia', '99': 'Outros reembolsos e ressarcimentos' };
const adjustmentLabels: Record<string, string> = { '2': 'Materiais', '5': 'Repasse consorciado', '6': 'Repasse de plano de saúde',
  '7': 'Serviços', '8': 'Subempreitada', '9': 'Profissional parceiro', '99': 'Outras deduções ISS',
  '101': 'Intermediação imobiliária', '102': 'Turismo', '103': 'Produção publicitária', '104': 'Mídia',
  '105': 'Glosa de saúde', '199': 'Outros reembolsos e ressarcimentos' };

export default function NfseModelDocumentRules({ id, value, onChange, profile, purpose }: {
  id: string; value: readonly NfseDocumentRule[]; onChange: (rules: NfseDocumentRule[]) => void;
  profile: NfseValuesContext['profile']; purpose: 'deduction' | 'reimbursement';
}) {
  const labels = profile === 'HOMOLOGATION_20261020' ? adjustmentLabels : purpose === 'deduction' ? deductionLabels : reimbursementLabels;
  const categories = nfseDocumentCategories(profile, purpose).map(code => ({ value: code, label: `${code} · ${labels[code]}` }));
  const municipal = profile === 'PRODUCTION_20260209' && purpose === 'deduction';
  const types = documentTypes.filter(type => municipal ? !['CTE', 'OTHER_NATIONAL_DFE'].includes(type.value)
    : !['MUNICIPAL_NFSE', 'NF_NFS'].includes(type.value));
  const patch = (index: number, change: Partial<NfseDocumentRule>) => onChange(value.map((rule, i) => i === index ? { ...rule, ...change } : rule));
  return <div className="nfse-wide">
    <p className="nfse-portal-note">Defina os critérios para usar documentos da operação. Os documentos e o fornecedor serão identificados ao emitir.</p>
    {value.map((rule, index) => {
      const prefix = `${id}-${index}`;
      return <fieldset className="nfse-model-section" key={prefix}>
        <legend>Regra documental {index + 1}</legend>
        <div className="nfse-model-grid">
          <NfseValuesChoice id={`${prefix}-document`} label="Tipo de documento vinculado" value={rule.documentType} options={types}
            onChange={next => patch(index, { documentType: next as NfseDocumentRule['documentType'], documentDescription: null })} />
          <NfseValuesChoice id={`${prefix}-category`} label="Categoria do documento" value={rule.categoryCode} options={categories}
            onChange={next => patch(index, { categoryCode: next, categoryDescription: null })} />
          {['99', '199'].includes(rule.categoryCode) && <label className="nfse-field"><span>Descrição da categoria *</span>
            <input required maxLength={150} value={rule.categoryDescription || ''} onChange={event => patch(index, { categoryDescription: event.target.value || null })} /></label>}
          {['OTHER_NATIONAL_DFE', 'OTHER_FISCAL', 'NON_FISCAL'].includes(rule.documentType) && <label className="nfse-field"><span>Descrição do tipo de documento *</span>
            <input required maxLength={255} value={rule.documentDescription || ''} onChange={event => patch(index, { documentDescription: event.target.value || null })} /></label>}
          <NfseValuesChoice id={`${prefix}-allocation`} label="Parcela a utilizar" value={rule.allocationMode}
            options={[{ value: 'ELIGIBLE_AMOUNT', label: 'Valor apto disponível do documento' }, { value: 'FIXED', label: 'Limite fixo por emissão' }, { value: 'PERCENTAGE', label: 'Percentual do valor apto' }]}
            onChange={next => patch(index, { allocationMode: next as NfseDocumentRule['allocationMode'], allocationValue: null })} />
          {rule.allocationMode !== 'ELIGIBLE_AMOUNT' && <NfseValuesDecimalField id={`${prefix}-allocation-value`}
            label={rule.allocationMode === 'FIXED' ? 'Limite da parcela (R$)' : 'Percentual do valor apto'}
            kind={rule.allocationMode === 'FIXED' ? 'MONEY' : 'PERCENT'} value={rule.allocationValue}
            onChange={next => patch(index, { allocationValue: next })} />}
          <NfseValuesChoice id={`${prefix}-supplier-mode`} label="Fornecedor do documento" value={rule.supplierSource}
            options={[{ value: 'DOCUMENT', label: 'Usar fornecedor identificado no documento ao emitir' },
              { value: 'OMIT', label: 'Não informar fornecedor, quando permitido' },
              ...(rule.supplierSource === 'FIXED_PARTNER' ? [{ value: 'FIXED_PARTNER', label: 'Fornecedor fixo · versão anterior', disabled: true }] : [])]}
            onChange={next => patch(index, { supplierSource: next as NfseDocumentRule['supplierSource'], supplierPartnerId: null, supplierPartnerLabel: undefined })} />
          {rule.supplierSource === 'FIXED_PARTNER' && <p className="nfse-wide nfse-portal-note" role="alert">
            Esta regra possui uma referência fixa de versão anterior. Para salvar, escolha usar o fornecedor do documento ao emitir ou não informar fornecedor, quando permitido.
          </p>}
        </div>
        <button type="button" className="nfse-button nfse-button-secondary" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remover regra documental {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="nfse-button nfse-button-secondary" disabled={value.length >= 1000} onClick={() => onChange([...value, {
      source: 'LINKED_OPERATION_DOCUMENTS', documentType: 'NATIONAL_NFSE', categoryCode: '', categoryDescription: null,
      documentDescription: null, allocationMode: 'ELIGIBLE_AMOUNT', allocationValue: null,
      supplierSource: 'DOCUMENT', supplierPartnerId: null,
    }])}>Adicionar regra documental</button>
  </div>;
}
