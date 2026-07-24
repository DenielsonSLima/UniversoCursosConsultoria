
export type StatusTurma =
  | 'PLANEJADA'
  | 'INSCRICOES_ABERTAS'
  | 'EM_ANDAMENTO'
  | 'FINALIZADA';
export type Turno = 'MATUTINO' | 'VESPERTINO' | 'NOTURNO' | 'INTEGRAL' | 'EAD';
export type TurmasSortBy = 'NOME_ASC' | 'NOME_DESC' | 'ALUNOS_DESC';

export interface Turma {
  id: string;
  codigo: string; // Gerado Automaticamente
  nome: string; // Gerado Automaticamente
  cursoId: string;
  cursoNome: string;
  modalidade: 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO' | 'EAD';
  poloId?: string; // Opcional pois EAD não tem
  poloNome?: string; // Opcional pois EAD não tem
  poloCnpj?: string;
  poloCidade?: string;
  poloEstado?: string;
  dataInicio: string;
  dataPrevisaoTermino: string;
  dataInicioInscricao?: string;
  dataFimInscricao?: string;
  publicarNoSite?: boolean;
  permitirInscricoesOnline?: boolean;
  exigeMatricula?: boolean;
  aceitaConcomitante?: boolean;
  aceitaSubsequente?: boolean;
  serieMinimaEnsinoMedio?: number;
  bloquearMatriculasAposCompletarVagas?: boolean;
  qtdVagasMinima?: number;
  frequenciaMinimaPercent?: number;
  mediaMinima?: number;
  turno: Turno;
  status: StatusTurma;
  alunosMatriculados: number;
  alunosAtivos?: number;
  alunosInativos?: number;
  vagasTotais: number;
  valorMatricula: number;
  valorRematricula: number;
  qtdParcelas: number;
  valorParcela: number;
  descontoPontualidade: number;
  jurosAtraso: number;
  multaAtraso: number;
  diaVencimentoPadrao?: number;
  instrucaoBoletoCarne?: string;
  origemFinanceira?: 'LEGADO' | 'NORMAL';
  financeiroHerdado?: boolean;
  gerarCobrancasFuturas?: boolean;
  sincronizarAsaasFuturo?: boolean;
  obsFinanceiraOrigem?: string;
  cronogramaFinanceiro?: any[];
  aplicarDescontoMatricula?: boolean;
  aplicarMultaJurosMatricula?: boolean;
  aplicarDescontoMensalidade?: boolean;
  aplicarMultaJurosMensalidade?: boolean;
  aplicarDescontoRematricula?: boolean;
  aplicarMultaJurosRematricula?: boolean;
  totalDisciplinas?: number;
  disciplinaAtual?: string;
  disciplinaAtualOrdem?: number;
  professorAtual?: string;
  proximaAulaData?: string;
  proximaAulaTitulo?: string;
}

export interface TurmasPageFilters {
  modalidade: Turma['modalidade'];
  poloId?: string;
  status: StatusTurma;
  sortBy?: TurmasSortBy;
  search?: string;
  dataInicial?: string;
  dataFinal?: string;
  page: number;
  pageSize: number;
}

export interface TurmasPageResult {
  data: Turma[];
  total: number;
}
