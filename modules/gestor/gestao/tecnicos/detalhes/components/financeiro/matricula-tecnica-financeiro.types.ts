import type { MatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.types';

export type MatriculaTecnicaFinanceiroStatus =
  | 'NAO_CONFIGURADO'
  | 'PENDENTE'
  | 'AGENDADA'
  | 'ATIVADA'
  | 'GERADA';

export type MatriculaTecnicaAtivacaoModo = 'AGORA' | 'AGENDADA';

export interface MatriculaTecnicaTitulo {
  id: string;
  status: string;
  valor: string;
  vencimento: string;
}

export interface MatriculaTecnicaRegraIdentidade {
  revisao: number;
  fingerprint: string;
  primeiroVencimentoSugerido: string;
}

export interface MatriculaTecnicaRegraAplicacaoItem {
  desconto: boolean;
  multaJuros: boolean;
}

export interface MatriculaTecnicaCronogramaItem {
  id: string;
  tipo: 'MATRICULA' | 'MENSALIDADE' | 'REMATRICULA';
  numero: number | null;
  ciclo: number;
  label: string;
  valor: string;
  dataVencimento: string;
  simulacao: {
    descontoAplicado: string;
    jurosMensal: string;
    jurosPercentualDia: string;
    jurosValorDia: string;
    multa: string;
    valorComDesconto: string;
    valorComAtraso: string;
  };
}

export interface MatriculaTecnicaRegra {
  revisao: number;
  fingerprint: string;
  primeiroVencimentoSugerido: string;
  valorMatricula: string;
  valorMensalidade: string;
  valorRematricula: string;
  mensalidadesPorCiclo: number;
  diaVencimento: number;
  identidade: {
    turmaRevisao: number;
    turmaFingerprint: string;
    overrideRevisao: number | null;
    overrideFingerprint: string | null;
    efetivaFingerprint: string;
    preview?: boolean;
  };
  cobranca: {
    matricula: { habilitada: boolean; valor: string };
    mensalidade: { habilitada: true; quantidade: number; valor: string };
    rematricula: { habilitada: boolean; valor: string };
  };
  vencimento: {
    diaBase: number;
    primeiroVencimentoSugerido: string;
  };
  encargos: {
    descontoPontualidade: string;
    jurosAtrasoPercentual: string;
    multaAtrasoPercentual: string;
  };
  aplicacao: {
    matricula: MatriculaTecnicaRegraAplicacaoItem;
    mensalidade: MatriculaTecnicaRegraAplicacaoItem;
    rematricula: MatriculaTecnicaRegraAplicacaoItem;
  };
  boleto: {
    instrucao: string;
  };
  cronogramaCiclo: MatriculaTecnicaCronogramaItem[];
  continuidade: {
    recorrente: boolean;
    proximoCiclo: 'APOS_REMATRICULA' | 'ENCERRA_APOS_MENSALIDADES';
    mensalidadesPorCiclo: number;
    maxCiclos: number;
    encerraAposCiclo: number;
  };
  curso?: {
    totalCiclos: number;
    totalMensalidades: number;
    totalNominal: string;
  };
}

export interface MatriculaTecnicaRegraTurmaInput {
  cobrarMatricula: boolean;
  valorMatricula: string;
  qtdMensalidades: number;
  valorMensalidade: string;
  cobrarRematricula: boolean;
  valorRematricula: string;
  diaVencimento: number;
  descontoPontualidade: string;
  jurosAtrasoPercentual: string;
  multaAtrasoPercentual: string;
  aplicarDescontoMatricula: boolean;
  aplicarMultaJurosMatricula: boolean;
  aplicarDescontoMensalidade: boolean;
  aplicarMultaJurosMensalidade: boolean;
  aplicarDescontoRematricula: boolean;
  aplicarMultaJurosRematricula: boolean;
  instrucaoBoleto: string;
}

export type MatriculaTecnicaOverrideInput = {
  [Key in keyof MatriculaTecnicaRegraTurmaInput]: MatriculaTecnicaRegraTurmaInput[Key] | null;
};

export interface MatriculaTecnicaOverride {
  ativo: boolean;
  identidade: {
    revisao: number;
    fingerprint: string;
  };
  cobranca: {
    matricula: { habilitada: boolean | null; valor: string | null };
    mensalidade: { quantidade: number | null; valor: string | null };
    rematricula: { habilitada: boolean | null; valor: string | null };
  };
  vencimento: {
    diaBase: number | null;
  };
  encargos: {
    descontoPontualidade: string | null;
    jurosAtrasoPercentual: string | null;
    multaAtrasoPercentual: string | null;
  };
  aplicacao: {
    matricula: { desconto: boolean | null; multaJuros: boolean | null };
    mensalidade: { desconto: boolean | null; multaJuros: boolean | null };
    rematricula: { desconto: boolean | null; multaJuros: boolean | null };
  };
  boleto: {
    instrucao: string | null;
  };
}

export type MatriculaTecnicaCicloFinanceiroEstadoInicial =
  | 'NOVA'
  | 'IMPORTADA_CICLO_1'
  | 'IMPORTADA_CONCLUIDA';

export type MatriculaTecnicaCicloFinanceiroCriterio =
  | 'QUITACAO_TOTAL'
  | 'PENULTIMA_SEM_ATRASO';

export interface MatriculaTecnicaCicloFinanceiroPolicy {
  habilitado: boolean;
  modo: 'MANUAL' | null;
  estadoInicial: MatriculaTecnicaCicloFinanceiroEstadoInicial | null;
  cicloBaseHistorico: number | null;
  cicloMaximo: number | null;
  criterioElegibilidade: MatriculaTecnicaCicloFinanceiroCriterio | null;
  revisao: number | null;
  fingerprint: string | null;
}

export interface PreVinculoAlunoTecnicoContexto {
  turma: {
    turmaId: string;
    codigo: string;
    nome: string;
    poloId: string;
    status: string;
    cicloFinanceiroTecnico: MatriculaTecnicaCicloFinanceiroPolicy;
  };
  aluno: {
    alunoId: string;
    nome: string;
  };
  regra: MatriculaTecnicaRegraIdentidade;
}

export interface MatriculaTecnicaFinanceiroRow {
  matriculaId: string;
  alunoId: string;
  alunoNome: string;
  matriculaExibicao: string;
  statusAcademico: string;
  valorMatriculaEfetivo: string | null;
  valorMensalidadeEfetivo: string | null;
  parcelasPagas: number;
  totalParcelas: number;
  progressoPercentual: string;
  situacaoFinanceira:
    | 'SEM_CONFIGURACAO'
    | 'PENDENTE'
    | 'AGENDADA'
    | 'ATIVA'
    | 'GERADA'
    | 'INADIMPLENTE'
    | 'EM_DIA';
  overrideAtivo: boolean;
  totais: {
    total: string;
    recebido: string;
    inadimplencia: string;
  };
  override: MatriculaTecnicaOverride | null;
  regraEfetiva: MatriculaTecnicaRegra | null;
  cicloManual: MatriculaTecnicaCicloManual;
  financeiro: {
    status: MatriculaTecnicaFinanceiroStatus;
    primeiroVencimento: string | null;
    ativarEm: string | null;
    regraRevisao: number | null;
    regraFingerprint: string | null;
    regraEfetivaFingerprint: string | null;
    regraDesatualizada: boolean;
    titulo: MatriculaTecnicaTitulo | null;
    updatedAt: string | null;
  };
}

export interface MatriculaTecnicaFinanceiroWorkspace {
  turma: {
    turmaId: string;
    codigo: string;
    nome: string;
    poloId: string;
    status: string;
    cicloFinanceiroTecnico: MatriculaTecnicaCicloFinanceiroPolicy;
  };
  regra: MatriculaTecnicaRegra;
  resumo: {
    total: string;
    recebido: string;
    inadimplencia: string;
    inadimplenciaPercentual: string;
    recebidoPercentual: string;
  };
  aluno: null | {
    alunoId: string;
    nome: string;
  };
  matriculas: MatriculaTecnicaFinanceiroRow[];
}

export interface PreverRegraFinanceiraTecnicaInput {
  turmaId: string;
  regra: MatriculaTecnicaRegraTurmaInput;
}

export interface SalvarRegraFinanceiraTecnicaInput extends PreverRegraFinanceiraTecnicaInput {
  requestId: string;
  expectedRevisao: number;
  expectedFingerprint: string;
}

export interface SalvarRegraFinanceiraTecnicaResult {
  operacao: 'SALVAR_REGRA_TURMA';
  requestId: string;
  replayed: boolean;
  regra: MatriculaTecnicaRegra;
  workspace: MatriculaTecnicaFinanceiroWorkspace;
}

export interface SalvarOverrideFinanceiroTecnicoInput {
  turmaId: string;
  matriculaId: string;
  requestId: string;
  expectedTurmaRevisao: number;
  expectedTurmaFingerprint: string;
  expectedOverrideRevisao: number;
  expectedOverrideFingerprint: string;
  override: MatriculaTecnicaOverrideInput;
  codigoAutorizacao: string;
  motivo: CondicaoIndividualMotivo;
  justificativa?: string | null;
}

export type CondicaoIndividualMotivo = 'BOLSA' | 'CONVENIO' | 'INCENTIVO' | 'NEGOCIACAO' | 'OUTRO';

export interface RemoverOverrideFinanceiroTecnicoInput extends Omit<
  SalvarOverrideFinanceiroTecnicoInput,
  'override'
> {}

export interface AlterarOverrideFinanceiroTecnicoResult {
  operacao: 'SALVAR_OVERRIDE_MATRICULA' | 'REMOVER_OVERRIDE_MATRICULA';
  requestId: string;
  replayed: boolean;
  matriculaId: string;
  matricula: MatriculaTecnicaFinanceiroRow;
  workspace: MatriculaTecnicaFinanceiroWorkspace;
}

export interface PreVincularAlunoTecnicoInput {
  turmaId: string;
  alunoId: string;
  requestId: string;
  expectedRegraRevisao: number;
  expectedRegraFingerprint: string;
  primeiroVencimento?: string | null;
}

export interface PreVincularAlunoTecnicoResult {
  operacao: 'PRE_VINCULO';
  requestId: string;
  replayed: boolean;
  matricula: MatriculaTecnicaFinanceiroRow;
  regraAplicada: MatriculaTecnicaRegraIdentidade;
  cobrancaGerada: false;
}

export interface AtivarFinanceiroMatriculaTecnicaInput {
  turmaId: string;
  matriculaId: string;
  modo: MatriculaTecnicaAtivacaoModo;
  requestId: string;
  expectedTurmaRevisao: number;
  expectedTurmaFingerprint: string;
  expectedOverrideRevisao: number;
  expectedOverrideFingerprint: string;
  expectedEfetivaFingerprint: string;
  ativarEm?: string | null;
}

export interface AtivarFinanceiroMatriculaTecnicaResult {
  operacao: 'ATIVACAO_INDIVIDUAL_FLEXIVEL';
  modo: MatriculaTecnicaAtivacaoModo;
  requestId: string;
  replayed: boolean;
  matricula: MatriculaTecnicaFinanceiroRow;
  regraAplicada: MatriculaTecnicaRegra;
  workspace: MatriculaTecnicaFinanceiroWorkspace;
}

export interface AtivarFinanceiroMatriculasTecnicasLoteInput {
  turmaId: string;
  matriculaIds: string[];
  modo: MatriculaTecnicaAtivacaoModo;
  requestId: string;
  expectedTurmaRevisao: number;
  expectedTurmaFingerprint: string;
  expectedRegras: Array<{
    matriculaId: string;
    overrideRevisao: number;
    overrideFingerprint: string;
    efetivaFingerprint: string;
  }>;
  ativarEm?: string | null;
}

export interface AtivacaoFinanceiroLoteItem {
  matriculaId: string;
  status: Extract<MatriculaTecnicaFinanceiroStatus, 'PENDENTE' | 'AGENDADA' | 'ATIVADA' | 'GERADA'>;
  situacaoFinanceira: MatriculaTecnicaFinanceiroRow['situacaoFinanceira'];
  titulo: MatriculaTecnicaTitulo | null;
}

export interface AtivarFinanceiroMatriculasTecnicasLoteResult {
  operacao: 'ATIVACAO_LOTE_FLEXIVEL';
  modo: MatriculaTecnicaAtivacaoModo;
  requestId: string;
  replayed: boolean;
  turmaId: string;
  total: number;
  resultados: AtivacaoFinanceiroLoteItem[];
  workspace: MatriculaTecnicaFinanceiroWorkspace;
}
