import React from 'react';
import { Zap } from 'lucide-react';
import { Turno } from '../../gestao.types';
import TurmaPresencialForm, { TurmaPresencialFormData } from './TurmaPresencialForm';

interface TurmaLivreFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  cursosDisponiveis: any[];
  selectedPoloId?: string;
}

const livreDefaults: TurmaPresencialFormData = {
  cursoId: '',
  poloId: '',
  dataInicio: '',
  dataPrevisaoTermino: '',
  turno: 'NOTURNO' as Turno,
  vagasTotais: 30,
  valorMatricula: 150,
  valorRematricula: 80,
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

const livreConfig = {
  modalidade: 'LIVRE' as const,
  title: 'Nova Turma Curso Livre',
  subtitle: 'Capacitação rápida e prática.',
  cursoLabel: 'Curso Livre',
  submitLabel: 'Abrir Turma',
  automaticLabel: 'Identificação Automática',
  Icon: Zap,
  theme: {
    accentText: 'text-amber-500',
    accentMutedText: 'text-amber-700/60',
    accentBorderFocus: 'focus:border-amber-500',
    accentHoverBg: 'hover:bg-amber-600',
    accentSoftBg: 'bg-amber-50',
    accentSoftBorder: 'border-amber-100',
    checkboxText: 'text-amber-600',
  },
  defaults: livreDefaults,
  generateIdentity: ({ curso, polo, formData }: { curso: any; polo: any; formData: TurmaPresencialFormData }) => {
    const date = new Date(formData.dataInicio);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');

    if (Number.isNaN(year)) return null;

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
  <TurmaPresencialForm {...props} config={livreConfig} />
);

export default TurmaLivreForm;
