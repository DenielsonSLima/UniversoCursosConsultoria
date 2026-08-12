import React from 'react';
import { Award } from 'lucide-react';
import { parseCivilDate } from '../../gestao-date.utils';
import TurmaPlanoUnicoForm from './turma-plano-unico/TurmaPlanoUnicoForm';
import type { TurmaPlanoUnicoFormConfig } from './turma-plano-unico/turma-plano-unico-form.types';

interface TurmaEspecializacaoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void | Promise<void>;
  cursosDisponiveis: any[];
  selectedPoloId?: string;
}

const especializacaoConfig: TurmaPlanoUnicoFormConfig = {
  modalidade: 'ESPECIALIZACAO' as const,
  title: 'Nova Especialização',
  subtitle: 'Pós-técnico e aprofundamento.',
  courseLabel: 'Especialização',
  submitLabel: 'Abrir especialização',
  Icon: Award,
  defaultTurno: 'VESPERTINO',
  defaultVagas: 35,
  theme: {
    accentText: 'text-rose-600',
    accentSoftText: 'text-rose-700/70',
    accentFocus: 'focus:border-rose-500 focus:ring-2 focus:ring-rose-100',
    accentHoverBg: 'hover:bg-rose-600',
    accentSoftBg: 'bg-rose-50',
    accentSoftBorder: 'border-rose-100',
    accentStepBg: 'bg-rose-500',
    accentStepText: 'text-rose-700',
  },
  generateIdentity: ({ curso, polo, formData }) => {
    const date = parseCivilDate(formData.dataInicio);
    if (!date) return null;
    const { year } = date;

    const siglaCurso = curso.nome.includes('Instrumentação') ? 'INST' : curso.nome.substring(0, 4).toUpperCase();
    const poloSigla = polo.cidade.substring(0, 3).toUpperCase();
    const turnoSigla = formData.turno.substring(0, 3).toUpperCase();

    return {
      codigo: `ESP-${siglaCurso}-${turnoSigla}-${poloSigla}-${year}`,
      nome: `${curso.nome.replace('Especialização em ', '')} - ${formData.turno.charAt(0) + formData.turno.slice(1).toLowerCase()} - ${polo.cidade} (${year})`,
    };
  },
};

const TurmaEspecializacaoForm: React.FC<TurmaEspecializacaoFormProps> = (props) => (
  <TurmaPlanoUnicoForm {...props} config={especializacaoConfig} />
);

export default TurmaEspecializacaoForm;
