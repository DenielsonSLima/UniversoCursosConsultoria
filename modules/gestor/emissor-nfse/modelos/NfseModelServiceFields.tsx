import React from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import type { NfseModelInput } from '../types/nfse.types';
import NfseFiscalCodeField, { type NfseFiscalCodeOption } from './NfseFiscalCodeField';
import NfseModelDescriptionEditor from './NfseModelDescriptionEditor';
import type { NfseDescriptionPreviewState } from './NfseDescriptionPreview';

export interface NfseModelFormValues {
  name: string;
  nationalServiceCode: string;
  serviceDescription: string;
  nbsCode: string;
  operationIndicatorCode: string;
  issTreatment: NfseModelInput['issTreatment'] | '';
  immunityType: NonNullable<NfseModelInput['immunityType']> | '';
  technicalResponsibilityDocument: string;
  referenceDocument: string;
  complementaryInfo: string;
  orderReference: string;
  active: boolean;
}

export type SetNfseModelField = <K extends keyof NfseModelFormValues>(
  key: K, value: NfseModelFormValues[K],
) => void;

interface Props {
  fields: NfseModelFormValues;
  setField: SetNfseModelField;
  specialTreatment: boolean | null;
  onSpecialTreatmentChange: (value: boolean) => void;
  catalogs?: {
    nationalServices: readonly NfseFiscalCodeOption[];
    nbs: readonly NfseFiscalCodeOption[];
    operationIndicators: readonly NfseFiscalCodeOption[];
  };
  catalogsLoading: boolean;
  catalogsError: boolean;
  onRetryCatalogs: () => void;
  descriptionPreview: NfseDescriptionPreviewState;
}

const treatmentOptions = [
  { value: 'IMUNIDADE', label: 'Imunidade' },
  { value: 'EXPORTACAO', label: 'Exportação de serviço' },
  { value: 'NAO_INCIDENCIA', label: 'Não incidência do ISSQN' },
] as const;

const immunityOptions = [
  { value: '1', label: '1 · Patrimônio, renda ou serviços entre entes federativos' },
  { value: '2', label: '2 · Entidades religiosas e templos, inclusive organizações assistenciais e beneficentes' },
  { value: '3', label: '3 · Partidos políticos e suas fundações, sindicatos de trabalhadores e instituições de educação ou assistência social sem fins lucrativos, atendidos os requisitos legais' },
  { value: '4', label: '4 · Livros, jornais, periódicos e papel destinado à sua impressão' },
  { value: '5', label: '5 · Fonogramas e videofonogramas musicais brasileiros, nas condições constitucionais' },
] as const;

export const NfseRequiredMark = () => <span className="nfse-model-required" aria-hidden="true"> *</span>;

export default function NfseModelServiceFields({
  fields, setField, specialTreatment, onSpecialTreatmentChange,
  catalogs, catalogsLoading, catalogsError, onRetryCatalogs, descriptionPreview,
}: Props) {
  return (
    <section className="nfse-model-section" aria-labelledby="nfse-model-service-heading">
      <h3 id="nfse-model-service-heading">Serviço/fornecimento prestado</h3>
      <div className="nfse-model-grid">
        <NfseFiscalCodeField id="nfse-model-national-code" label="Código de Tributação Nacional" required
          value={fields.nationalServiceCode} onChange={(value) => setField('nationalServiceCode', value)}
          options={catalogs?.nationalServices} loading={catalogsLoading} error={catalogsError} />
        <NfseFiscalCodeField id="nfse-model-nbs-code" label="Item da NBS correspondente ao serviço/fornecimento prestado" required
          value={fields.nbsCode} onChange={(value) => setField('nbsCode', value)}
          options={catalogs?.nbs} loading={catalogsLoading} error={catalogsError} />
        {catalogsError && <div className="nfse-wide nfse-model-catalog-retry" role="alert">
          <span>Catálogos indisponíveis.</span>
          <button type="button" className="nfse-button nfse-button-secondary" onClick={onRetryCatalogs}>Tentar novamente</button>
        </div>}
        <fieldset className="nfse-model-choices nfse-wide">
          <legend>O serviço/fornecimento prestado é um caso de imunidade, exportação de serviço ou não incidência do ISSQN?<NfseRequiredMark /></legend>
          <div className="nfse-model-radio-group">
            <label><input type="radio" name="nfse-special-treatment" value="no" required checked={specialTreatment === false} onChange={() => onSpecialTreatmentChange(false)} />Não</label>
            <label><input type="radio" name="nfse-special-treatment" value="yes" required checked={specialTreatment === true} onChange={() => onSpecialTreatmentChange(true)} />Sim</label>
          </div>
        </fieldset>
        {specialTreatment && <div className="nfse-field">
          <label htmlFor="nfse-model-iss-treatment">Situação do ISSQN<NfseRequiredMark /></label>
          <InstitutionalSelect id="nfse-model-iss-treatment" ariaLabel="Situação do ISSQN" required value={fields.issTreatment} options={treatmentOptions} onValueChange={(value) => {
            const option = treatmentOptions.find((item) => item.value === value);
            if (!option) return;
            setField('issTreatment', option.value);
            if (option.value !== 'IMUNIDADE') setField('immunityType', '');
          }} />
        </div>}
        {fields.issTreatment === 'IMUNIDADE' && <div className="nfse-field">
          <label htmlFor="nfse-model-immunity">Tipo de imunidade<NfseRequiredMark /></label>
          <InstitutionalSelect id="nfse-model-immunity" ariaLabel="Tipo de imunidade" required value={fields.immunityType} options={immunityOptions} onValueChange={(value) => {
            const option = immunityOptions.find((item) => item.value === value);
            if (option) setField('immunityType', option.value);
          }} />
        </div>}
        <NfseFiscalCodeField id="nfse-model-operation-code" label="Código indicador da operação"
          value={fields.operationIndicatorCode} onChange={(value) => setField('operationIndicatorCode', value)}
          options={catalogs?.operationIndicators} loading={catalogsLoading} error={catalogsError} />
        <NfseModelDescriptionEditor value={fields.serviceDescription} onChange={(value) => setField('serviceDescription', value)} preview={descriptionPreview} />
      </div>
    </section>
  );
}
