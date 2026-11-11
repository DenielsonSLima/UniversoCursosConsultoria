import { useState } from 'react';
import FinancialUnderlineTabs from '../../financeiro/components/FinancialUnderlineTabs';
import NfseEmissionModelsSection from './NfseEmissionModelsSection';
import NfseCancellationModelsSection from '../cancelamento/NfseCancellationModelsSection';

export default function ModelosNfseTab() {
  const [kind, setKind] = useState<'EMISSAO' | 'CANCELAMENTO'>('EMISSAO');
  return <>
    <div className="nfse-model-kind-tabs"><FinancialUnderlineTabs compact ariaLabel="Tipos de modelos fiscais" idPrefix="nfse-model-kind" value={kind} onChange={setKind}
      items={[{ id: 'EMISSAO', label: 'Emissão' }, { id: 'CANCELAMENTO', label: 'Cancelamento' }]} /></div>
    {kind === 'EMISSAO' ? <NfseEmissionModelsSection /> : <NfseCancellationModelsSection />}
  </>;
}
