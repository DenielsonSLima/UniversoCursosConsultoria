export type DependenciaWorkspaceTab =
  | 'pendentes'
  | 'programadas'
  | 'encerradas'
  | 'regras';

export type DependenciaStatus =
  | 'DIARIO_EM_ABERTO'
  | 'PENDENTE_ENCAMINHAMENTO'
  | 'AGUARDANDO_OFERTA'
  | 'AGUARDANDO_PAGAMENTO'
  | 'PAGAMENTO_PROCESSANDO'
  | 'PROGRAMADA'
  | 'EM_CURSO'
  | 'AGUARDANDO_RESULTADO'
  | 'CONCLUIDA_APROVADA'
  | 'CONCLUIDA_REPROVADA'
  | 'CANCELADA'
  | 'DISPENSADA'
  | string;

export interface DependenciaBoleto {
  recebivelId: string | null;
  status: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  boletoUrl: string | null;
  nossoNumero: string | null;
}

export interface DependenciaAcademica {
  id: string;
  tentativaId: string | null;
  tentativaNumero: number;
  matriculaId: string;
  alunoId: string;
  alunoNome: string;
  alunoCpf: string | null;
  modalidade: string;
  cursoNome: string;
  turmaOrigemId: string;
  turmaOrigemNome: string;
  turmaOrigemCodigo: string | null;
  disciplinaId: string;
  disciplinaNome: string;
  cargaHoraria: number;
  motivoReprovacao: string;
  resultadoOriginal: string;
  notaOriginal: number | null;
  frequenciaOriginal: number | null;
  resultadoConsolidado: boolean;
  acionavel: boolean;
  diarioBloqueio: string | null;
  diarioFechadoEm: string | null;
  diarioObservacao: string | null;
  status: DependenciaStatus;
  turmaDestinoId: string | null;
  turmaDestinoNome: string | null;
  turmaDestinoCodigo: string | null;
  professorNome: string | null;
  dataInicio: string | null;
  proximaAula: string | null;
  dataEncerramento: string | null;
  notaFinal: number | null;
  frequenciaFinal: number | null;
  cobrancaId: string | null;
  cobrancaStatus: string | null;
  valor: number | null;
  dataVencimento: string | null;
  boleto: DependenciaBoleto;
}

export interface DependenciaOferta {
  id: string;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string | null;
  disciplinaId: string;
  disciplinaNome: string;
  professorNome: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  periodoNome: string | null;
  vagasDisponiveis: number | null;
  compativel: boolean;
  impedimento: string | null;
}

export interface DependenciaRegraFinanceira {
  id: string;
  disciplinaId: string | null;
  disciplinaNome: string;
  cargaHoraria: number | null;
  faixa: string;
  percentual: number;
  valorReferencia: number | null;
  vigenciaInicio: string | null;
  origem: string;
  atualizadoEm: string | null;
}

export interface DependenciaDisciplinaConfiguravel {
  id: string;
  nome: string;
  cargaHoraria: number | null;
  cursoId: string | null;
  cursoNome: string | null;
}

export interface DependenciasWorkspace {
  dependencias: DependenciaAcademica[];
  regrasFinanceiras: DependenciaRegraFinanceira[];
  disciplinasConfiguraveis: DependenciaDisciplinaConfiguravel[];
  atualizadoEm: string | null;
}

export interface DependenciaPrevia {
  turmaDestinoId: string;
  disciplinaNome: string;
  turmaDestinoNome: string;
  cargaHoraria: number;
  percentualAplicado: number;
  valorBase: number;
  valorCobrar: number;
  dataVencimento: string;
  descricaoCobranca: string;
  regraResumo: string;
  podeConfirmar: boolean;
  bloqueio: string | null;
}

export interface DependenciaConfirmacao {
  tentativaId: string;
  cobrancaId: string | null;
  recebivelId: string | null;
  turmaId: string | null;
  disciplinaId: string | null;
  status: string;
}

export interface DependenciaCheckoutResult extends DependenciaConfirmacao {
  boleto: DependenciaBoleto;
}

export interface DependenciaPreviaInput {
  poloId: string;
  matriculaId: string;
  disciplinaId: string;
  turmaDestinoId: string;
  dataVencimento: string;
}

export interface DependenciaConfirmacaoInput extends DependenciaPreviaInput {
  idempotencyKey: string;
}

export interface DependenciaPoliticaInput {
  poloId: string;
  disciplinaId: string;
  multiplicadorParcela: number;
  idempotencyKey: string;
}

export interface DependenciaPoliticaRemocaoInput {
  poloId: string;
  politicaId: string;
}
