import React from 'react';
import type { NfseModelFormValues, SetNfseModelField } from './NfseModelServiceFields';

interface Props { fields: NfseModelFormValues; setField: SetNfseModelField }

export default function NfseModelComplementaryFields({ fields, setField }: Props) {
  return (
    <section className="nfse-model-section nfse-model-complementary" aria-labelledby="nfse-model-complementary-heading">
      <h3 id="nfse-model-complementary-heading">Informações complementares</h3>
      <div className="nfse-model-grid">
        <label className="nfse-field">
          <span>Número do documento de responsabilidade técnica</span>
          <input maxLength={40} value={fields.technicalResponsibilityDocument} onChange={(event) => setField('technicalResponsibilityDocument', event.target.value)} />
        </label>
        <label className="nfse-field">
          <span>Documento de referência</span>
          <input maxLength={255} value={fields.referenceDocument} onChange={(event) => setField('referenceDocument', event.target.value)} />
        </label>
        <label className="nfse-field nfse-wide">
          <span>Informações complementares</span>
          <textarea maxLength={2000} value={fields.complementaryInfo} onChange={(event) => setField('complementaryInfo', event.target.value)} />
          <small className="nfse-model-counter">{fields.complementaryInfo.length}/2000</small>
        </label>
        <label className="nfse-field nfse-wide">
          <span>Número do pedido, ordem de compra, ordem de serviço ou projeto que autorize a prestação do serviço/fornecimento em operações B2B</span>
          <input maxLength={60} value={fields.orderReference} onChange={(event) => setField('orderReference', event.target.value)} />
        </label>
      </div>
    </section>
  );
}
