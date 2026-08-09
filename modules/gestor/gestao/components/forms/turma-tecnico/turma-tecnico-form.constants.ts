import { DEFAULT_INSTRUCAO_BOLETO_CARNE } from '../../../tecnicos/detalhes/components/financeiro/financeiro-config.service';
import type {
  TurmaTecnicoFormData,
  TurmaTecnicoStep,
} from './turma-tecnico-form.types';

export const TURMA_TECNICO_STEPS: TurmaTecnicoStep[] = [
  {
    id: 'TURMA',
    label: 'Dados da turma',
    shortLabel: 'Turma',
    description: 'Curso, polo, calendário, turno e capacidade.',
  },
  {
    id: 'INSCRICOES',
    label: 'Divulgação e inscrições',
    shortLabel: 'Inscrições',
    description: 'Site, matrícula online, escolaridade e vagas.',
  },
  {
    id: 'FINANCEIRO',
    label: 'Regra financeira',
    shortLabel: 'Financeiro',
    description: 'Cobranças, parcelas, encargos e texto do boleto.',
  },
  {
    id: 'REVISAO',
    label: 'Regras e revisão',
    shortLabel: 'Revisão',
    description: 'Critérios acadêmicos e conferência final.',
  },
];

export const createInitialTurmaTecnicoFormData = (
  selectedPoloId?: string,
): TurmaTecnicoFormData => ({
  cursoId: '',
  poloId: selectedPoloId || '',
  dataInicio: '',
  dataPrevisaoTermino: '',
  dataInicioInscricao: '',
  dataFimInscricao: '',
  publicarNoSite: false,
  permitirInscricoesOnline: false,
  exigeMatricula: true,
  aceitaConcomitante: true,
  aceitaSubsequente: true,
  serieMinimaEnsinoMedio: 2,
  qtdVagasMinima: 0,
  bloquearMatriculasAposCompletarVagas: true,
  turno: 'NOTURNO',
  vagasTotais: 40,
  frequenciaMinimaPercent: 75,
  mediaMinima: 6,
  cobrarMatricula: true,
  valorMatricula: 150,
  cobrarRematricula: true,
  valorRematricula: 150,
  qtdParcelas: 12,
  valorParcela: 279.9,
  descontoPontualidade: 19.9,
  jurosAtraso: 1,
  multaAtrasoPercentual: 2,
  aplicarDescontoMatricula: false,
  aplicarMultaJurosMatricula: false,
  aplicarDescontoMensalidade: true,
  aplicarMultaJurosMensalidade: true,
  aplicarDescontoRematricula: false,
  aplicarMultaJurosRematricula: false,
  diaVencimentoPadrao: 10,
  instrucaoBoletoCarne: DEFAULT_INSTRUCAO_BOLETO_CARNE,
  origemFinanceira: 'NORMAL',
  financeiroHerdado: false,
  gerarCobrancasFuturas: true,
  sincronizarAsaasFuturo: false,
});

export const FINANCIAL_POLICY_OPTIONS = [
  {
    label: 'Matrícula',
    enabledKey: 'cobrarMatricula',
    descontoKey: 'aplicarDescontoMatricula',
    multaKey: 'aplicarMultaJurosMatricula',
  },
  {
    label: 'Mensalidades',
    enabledKey: null,
    descontoKey: 'aplicarDescontoMensalidade',
    multaKey: 'aplicarMultaJurosMensalidade',
  },
  {
    label: 'Rematrícula',
    enabledKey: 'cobrarRematricula',
    descontoKey: 'aplicarDescontoRematricula',
    multaKey: 'aplicarMultaJurosRematricula',
  },
] as const;
