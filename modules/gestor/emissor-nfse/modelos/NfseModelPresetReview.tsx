import React from 'react';
import type { NfseModelPeopleOptions } from './services/nfse-model-people-options';
import type { NfseModelServiceOptions } from './services/nfse-model-service-options';
import type { NfseModelAdditionalDraft } from './services/nfse-model-additional.types';
import type { NfseModelValuesDraft, NfseValuesCatalogs, NfseValuesContext } from './services/nfse-model-values.types';
import { describeNfsePresetCode, type NfsePresetReviewCatalogs } from './additional/nfse-preset-review.domains';
import { nfsePresetReviewRows } from './additional/nfse-preset-review.presentation';

export interface NfseModelPresetReviewFields {
  name: string; active: boolean; nationalServiceCode: string; nbsCode: string;
  serviceDescription: string; issTreatment: string; immunityType?: string | null;
  operationIndicatorCode?: string; technicalResponsibilityDocument?: string; referenceDocument?: string;
  complementaryInfo?: string; orderReference?: string;
  peopleOptions: NfseModelPeopleOptions | null;
  serviceOptions: NfseModelServiceOptions | null;
  additionalOptions?: NfseModelAdditionalDraft | null;
  valuesOptions?: NfseModelValuesDraft | null;
}
interface Props { valuesProfile?: NfseValuesContext['profile']; catalogs?: NfsePresetReviewCatalogs; valuesCatalogs?: NfseValuesCatalogs; fields: NfseModelPresetReviewFields; onEditStep: (step: 'people' | 'service' | 'values') => void; disabled?: boolean }

function ReviewSection({ title, step, rows, onEditStep, disabled }: {
  title: string; step: 'people' | 'service' | 'values'; rows: { label: string; value: string }[];
  onEditStep: Props['onEditStep']; disabled: boolean;
}) {
  return <section className="nfse-model-section nfse-model-review-section">
    <div className="nfse-model-review-heading"><h3>{title}</h3><button type="button" className="nfse-button nfse-button-secondary" disabled={disabled} onClick={() => onEditStep(step)}>{step === 'people' ? 'Editar regras' : `Editar ${title.toLowerCase()}`}</button></div>
    {rows.length ? <dl className="nfse-model-review-list">{rows.map((row, index) => <div className="nfse-model-review-row" key={`${row.label}-${index}`}>
      <dt className="nfse-model-review-key">{row.label}</dt><dd className="nfse-model-review-value">{row.value}</dd>
    </div>)}</dl> : <p className="nfse-portal-note">Nenhuma regra foi configurada nesta etapa.</p>}
  </section>;
}

export default function NfseModelPresetReview({ fields, onEditStep, disabled = false, catalogs, valuesCatalogs, valuesProfile }: Props) {
  const rows = (value: unknown) => nfsePresetReviewRows(value, '', [], catalogs, valuesCatalogs, valuesProfile);
  const code = (key: string, value: string) => describeNfsePresetCode(key, value, [], catalogs, valuesCatalogs, valuesProfile) || `${value} · Descrição indisponível`;
  const peopleRows = [...rows(fields.peopleOptions), ...rows(fields.additionalOptions?.people)];
  const treatment = { TRIBUTAVEL: 'Operação tributável', IMUNIDADE: 'Imunidade', EXPORTACAO: 'Exportação de serviço', NAO_INCIDENCIA: 'Não incidência do ISSQN' }[fields.issTreatment] || 'Ainda não definido';
  const serviceRows = [{ label: 'Código de tributação nacional', value: fields.nationalServiceCode ? code('nationalServiceCode', fields.nationalServiceCode) : 'Ainda não definido' },
    { label: 'NBS', value: fields.nbsCode ? code('nbsCode', fields.nbsCode) : 'Ainda não definido' }, { label: 'Tratamento do ISSQN', value: treatment },
    { label: 'Descrição do serviço', value: fields.serviceDescription || 'Ainda não definida' },
    ...(fields.immunityType ? [{ label: 'Tipo de imunidade', value: code('immunityType', fields.immunityType) }] : []),
    ...(fields.operationIndicatorCode ? [{ label: 'Indicador da operação', value: code('operationIndicatorCode', fields.operationIndicatorCode) }] : []),
    ...rows(fields.serviceOptions), ...rows(fields.additionalOptions?.service),
    ...([['Documento de responsabilidade técnica', fields.technicalResponsibilityDocument], ['Documento de referência', fields.referenceDocument],
      ['Informações complementares', fields.complementaryInfo], ['Pedido/ordem/projeto', fields.orderReference]] as const)
      .flatMap(([label, value]) => value ? [{ label, value }] : [])];
  const pending = [...peopleRows, ...serviceRows, ...rows(fields.valuesOptions)].filter(row => row.value === 'Definir na emissão').length;
  return <div className="nfse-model-review">
    <section className="nfse-model-section"><h3>Revisão do pré-modelo</h3>
      <p>{fields.name || 'Pré-modelo sem nome'} · {fields.active ? 'Ativo' : 'Inativo'}</p>
      <p className="nfse-portal-note">Confira as escolhas e as origens dos dados. O salvamento registra o pré-modelo; os dados concretos serão conferidos ao preparar cada emissão.</p>
      {pending > 0 && <p className="nfse-portal-note">{pending} regra(s) está(ão) definida(s) para resolução na emissão.</p>}
      {fields.additionalOptions?.people.providerLocation === 'FROM_PARTNER' && <p className="nfse-portal-note">A localização do prestador e a aplicação de comércio exterior dependem do cadastro escolhido na emissão.</p>}
    </section>
    <ReviewSection title="Regras da emissão" step="people" rows={peopleRows} onEditStep={onEditStep} disabled={disabled} />
    <ReviewSection title="Serviço" step="service" rows={serviceRows} onEditStep={onEditStep} disabled={disabled} />
    <ReviewSection title="Valores" step="values" rows={rows(fields.valuesOptions)} onEditStep={onEditStep} disabled={disabled} />
  </div>;
}
