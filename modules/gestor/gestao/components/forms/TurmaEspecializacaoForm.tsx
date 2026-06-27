import React from 'react';
import { Award } from 'lucide-react';
import { Turno } from '../../gestao.types';
import TurmaPresencialForm, { TurmaPresencialFormData } from './TurmaPresencialForm';

interface TurmaEspecializacaoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  cursosDisponiveis: any[];
  selectedPoloId?: string;
}

const especializacaoDefaults: TurmaPresencialFormData = {
  cursoId: '',
  poloId: '',
  dataInicio: '',
  dataPrevisaoTermino: '',
  turno: 'VESPERTINO' as Turno,
  vagasTotais: 35,
  valorMatricula: 200,
  valorRematricula: 120,
  qtdParcelas: 1,
  valorParcela: 0,
  descontoPontualidade: 0,
  jurosAtraso: 2,
  multaAtraso: 5,
  diaVencimentoPadrao: 10,
  dataInicioInscricao: '',
  dataFimInscricao: '',
  exigeMatricula: true,
  qtdVagasMinima: 0,
  bloquearMatriculasAposCompletarVagas: true,
  nomeAutomatico: '',
  codigoAutomatico: '',
};

const especializacaoConfig = {
  modalidade: 'ESPECIALIZACAO' as const,
  title: 'Nova Especialização',
  subtitle: 'Pós-técnico e aprofundamento.',
  cursoLabel: 'Especialização',
  submitLabel: 'Abrir Especialização',
  automaticLabel: 'Gerado Automaticamente',
  Icon: Award,
  theme: {
    accentText: 'text-rose-600',
    accentMutedText: 'text-rose-700/60',
    accentBorderFocus: 'focus:border-rose-500',
    accentHoverBg: 'hover:bg-rose-600',
    accentSoftBg: 'bg-rose-50',
    accentSoftBorder: 'border-rose-100',
    checkboxText: 'text-rose-600',
  },
  defaults: especializacaoDefaults,
  generateIdentity: ({ curso, polo, formData }: { curso: any; polo: any; formData: TurmaPresencialFormData }) => {
    const date = new Date(formData.dataInicio);
    const year = date.getFullYear();

    if (Number.isNaN(year)) return null;

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
  <TurmaPresencialForm {...props} config={especializacaoConfig} />
);

export default TurmaEspecializacaoForm;
