import React from 'react';
import { ClipboardCheck, CircleDollarSign, UsersRound, Wrench } from 'lucide-react';

const stepIcons = [UsersRound, Wrench, CircleDollarSign, ClipboardCheck];

export const nfseModelSteps = [
  { id: 'people', label: 'Configuração' },
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
      {nfseModelSteps.map((step, index) => { const Icon = stepIcons[index]; return <li key={step.id}>
        <button type="button" aria-current={current === step.id ? 'step' : undefined}
          disabled={disabled} onClick={() => onChange(step.id)}>
          <Icon size={16} aria-hidden="true" />{step.label}
        </button>
      </li>; })}
    </ol>
  </nav>;
}

