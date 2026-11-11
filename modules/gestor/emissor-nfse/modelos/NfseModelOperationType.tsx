import React from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import type { NfseModelServiceOptions } from './services/nfse-model-service-options';
import { requiresNfseOperationType } from './nfse-model-options-form';
import { NfseRequiredMark } from './NfseModelServiceFields';

interface Props {
  options: NfseModelServiceOptions | null | undefined;
  nationalServiceCode: string;
  onChange: (options: NfseModelServiceOptions) => void;
}

// TSRTCTpOper in the versioned national layout, tiposSimples_v1.01.xsd.
const operationTypes = [
  { value: '1', label: 'Fornecimento com pagamento posterior' },
  { value: '2', label: 'Recebimento do pagamento com fornecimento já realizado' },
  { value: '3', label: 'Fornecimento com pagamento já realizado' },
  { value: '4', label: 'Recebimento do pagamento com fornecimento posterior' },
  { value: '5', label: 'Fornecimento e recebimento do pagamento concomitantes' },
] as const;

export default function NfseModelOperationType({ options, nationalServiceCode, onChange }: Props) {
  if (!options || !requiresNfseOperationType(options, nationalServiceCode)) return null;
  return <section className="nfse-model-section" aria-labelledby="nfse-model-operation-heading">
    <h3 id="nfse-model-operation-heading">Tipo de operação</h3>
    <p className="nfse-model-help">Exigido para compras governamentais ou serviços dos códigos 25.05, 15.09, 17.12 e 10.05.</p>
    <div className="nfse-field">
      <label htmlFor="nfse-model-operation-type">Selecione o tipo de operação<NfseRequiredMark /></label>
      <InstitutionalSelect id="nfse-model-operation-type" ariaLabel="Tipo de operação" required
        value={options.operationType || ''} options={operationTypes} onValueChange={value => {
          const option = operationTypes.find(item => item.value === value);
          if (option) onChange({ ...options, operationType: option.value });
        }} />
    </div>
  </section>;
}
