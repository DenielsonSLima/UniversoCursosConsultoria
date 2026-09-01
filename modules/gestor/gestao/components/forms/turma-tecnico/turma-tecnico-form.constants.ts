import { DEFAULT_INSTRUCAO_BOLETO_CARNE } from '../../../tecnicos/detalhes/components/financeiro/financeiro-config.service';
import type {
  TurmaTecnicoEstadoFinanceiroInicial,
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
    id: 'AUTORIZACAO',
    label: 'Autorização individual',
    shortLabel: 'Autorização',
    description: 'Código que protege bolsas, incentivos e valores especiais.',
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
  primeiroVencimentoPadrao: '',
  codigoCondicaoIndividual: '',
  confirmarCodigoCondicaoIndividual: '',
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
  estadoFinanceiroInicial: 'NOVA',
  criterioElegibilidadeCiclo: 'PENULTIMA_SEM_ATRASO',
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
  gerarCobrancasFuturas: false,
  sincronizarAsaasFuturo: false,
});

export const TURMA_TECNICO_FINANCIAL_STATE_OPTIONS: Array<{
  value: TurmaTecnicoEstadoFinanceiroInicial;
  title: string;
  eyebrow: string;
  description: string;
  nextAction: string;
}> = [
  {
    value: 'NOVA',
    title: 'Turma nova',
    eyebrow: 'Nenhum ciclo no histórico',
    description: 'Adicionar o aluno apenas salva a configuração financeira como pendente.',
    nextAction: 'O gestor poderá gerar manualmente o 1º ciclo por aluno.',
  },
  {
    value: 'IMPORTADA_CICLO_1',
    title: 'Importada · 1º ciclo concluído',
    eyebrow: 'Ciclo 1 reconhecido como histórico',
    description: 'Use para turma em andamento trazida de outro sistema, sem recriar títulos antigos.',
    nextAction: 'O gestor poderá gerar manualmente apenas o 2º ciclo por aluno elegível.',
  },
  {
    value: 'IMPORTADA_CONCLUIDA',
    title: 'Importada · 2 ciclos concluídos',
    eyebrow: 'Histórico financeiro completo',
    description: 'Reconhece os dois ciclos anteriores e preserva somente o histórico.',
    nextAction: 'Nenhum novo ciclo financeiro ficará disponível.',
  },
];

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
