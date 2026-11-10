import React from 'react';

export const nfseModelSteps = [
  { id: 'people', label: 'Pessoas' },
  { id: 'service', label: 'Serviço' },
  { id: 'values', label: 'Valores' },
  { id: 'review', label: 'Revisão' },
] as const;

export type NfseModelStep = typeof nfseModelSteps[number]['id'];

interface Props {
  current: NfseModelStep;
  disabled: boolean;
  onChange: (step: NfseModelStep) => void;
}

export default function NfseModelSteps({ current, disabled, onChange }: Props) {
  return <nav className="nfse-model-steps" aria-label="Etapas do pré-modelo">
    <ol>
      {nfseModelSteps.map((step, index) => <li key={step.id}>
        <button type="button" aria-current={current === step.id ? 'step' : undefined}
          disabled={disabled} onClick={() => onChange(step.id)}>
          <span className="nfse-model-step-number" aria-hidden="true">{index + 1}</span>{step.label}
        </button>
      </li>)}
    </ol>
  </nav>;
}

export function NfseModelPendingStep({ step }: { step: 'values' | 'review' }) {
  const values = step === 'values';
  return <section className="nfse-model-section nfse-model-step-notice" aria-labelledby={`nfse-model-${step}-heading`}>
    <h3 id={`nfse-model-${step}-heading`}>{values ? 'Valores' : 'Revisão'}</h3>
    <p>{values ? 'Aguardando a referência da etapa 3 para configurar os valores do pré-modelo.'
      : 'Aguardando a referência da etapa 4 para configurar a revisão do pré-modelo.'}</p>
    <p>Você pode salvar as definições já disponíveis do pré-modelo.</p>
  </section>;
}
