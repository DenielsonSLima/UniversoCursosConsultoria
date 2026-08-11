import React from 'react';
import { Zap } from 'lucide-react';
import { parseCivilDate } from '../../gestao-date.utils';
import TurmaPlanoUnicoForm from './turma-plano-unico/TurmaPlanoUnicoForm';
import type { TurmaPlanoUnicoFormConfig } from './turma-plano-unico/turma-plano-unico-form.types';

interface TurmaLivreFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void | Promise<void>;
  cursosDisponiveis: any[];
  selectedPoloId?: string;
}

const livreConfig: TurmaPlanoUnicoFormConfig = {
  modalidade: 'LIVRE' as const,
  title: 'Nova Turma Curso Livre',
  subtitle: 'Capacitação rápida e prática.',
  courseLabel: 'Curso Livre',
  submitLabel: 'Abrir turma',
  Icon: Zap,
  defaultTurno: 'NOTURNO',
  defaultVagas: 30,
  theme: {
    accentText: 'text-amber-500',
    accentSoftText: 'text-amber-700/70',
    accentFocus: 'focus:border-amber-500 focus:ring-2 focus:ring-amber-100',
    accentHoverBg: 'hover:bg-amber-600',
    accentSoftBg: 'bg-amber-50',
    accentSoftBorder: 'border-amber-100',
    accentStepBg: 'bg-amber-500',
    accentStepText: 'text-amber-700',
  },
  generateIdentity: ({ curso, polo, formData }) => {
    const date = parseCivilDate(formData.dataInicio);
    if (!date) return null;
    const { year } = date;
    const month = date.month.toString().padStart(2, '0');

    const siglaCurso = curso.nome.substring(0, 4).toUpperCase().replace(/\s/g, '');
    const poloSigla = polo.cidade.substring(0, 3).toUpperCase();
    const turnoSigla = formData.turno.substring(0, 3).toUpperCase();

    return {
      codigo: `LIVRE-${siglaCurso}-${turnoSigla}-${poloSigla}-${month}/${year.toString().slice(-2)}`,
      nome: `${curso.nome} - ${formData.turno.charAt(0) + formData.turno.slice(1).toLowerCase()} - ${polo.cidade}`,
    };
  },
};

const TurmaLivreForm: React.FC<TurmaLivreFormProps> = (props) => (
  <TurmaPlanoUnicoForm {...props} config={livreConfig} />
);

export default TurmaLivreForm;
