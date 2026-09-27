export type ConvenioMesStatus = 'ABERTO' | 'FINALIZADO';
export type ConvenioStatusScope = 'ABERTOS' | 'FINALIZADOS' | 'TODOS';
export type ConvenioMovimentoTipo = 'SALDO_INICIAL' | 'CREDITO' | 'DESPESA';
export type ConvenioMovimentoStatus =
  | 'CONFIRMADO'
  | 'PENDENTE'
  | 'PAGO'
  | 'CANCELADO'
  | 'ESTORNADO';

export interface ConvenioFinanceiroMes {
  id: string;
  convenioId: string;
  nome: string;
  parceiroId: string | null;
  parceiroNome: string | null;
  poloId: string;
  poloNome: string;
  competencia: string;
  status: ConvenioMesStatus;
  saldoInicial: number;
  creditos: number;
  despesasPagas: number;
  despesasPendentes: number;
  saldoDisponivel: number;
  saldoProjetado: number;
  quantidadeCreditos: number;
  quantidadeDespesas: number;
  fechadoEm: string | null;
  observacao: string | null;
  sucessoraId: string | null;
}

export interface ConveniosResumo {
  conveniosAtivos: number;
  mesesAbertos: number;
  mesesFinalizados: number;
  saldoInicial: number;
  creditos: number;
  despesasPagas: number;
  despesasPendentes: number;
  saldoDisponivel: number;
  saldoProjetado: number;
}

export interface ConveniosListResult {
  versao: 1;
  resumo: ConveniosResumo;
  itens: ConvenioFinanceiroMes[];
}

export interface ConvenioMovimento {
  id: string;
  tipo: ConvenioMovimentoTipo;
  status: ConvenioMovimentoStatus;
  data: string;
  descricao: string;
  valor: number;
  contaNome: string | null;
  origemId: string | null;
  observacao: string | null;
}

export interface ConvenioMesDetalhe {
  versao: 1;
  mes: ConvenioFinanceiroMes;
  movimentos: ConvenioMovimento[];
}

export interface CriarConvenioInput {
  requestId: string;
  poloId: string;
  parceiroId?: string;
  nome: string;
  competencia: string;
  observacao?: string;
}

export interface CriarConvenioResult {
  replayed: boolean;
  mes: ConvenioFinanceiroMes;
}

export interface LancarConvenioCreditoInput {
  requestId: string;
  competenciaId: string;
  contaBancariaId: string;
  dataCredito: string;
  valor: number;
  formaRecebimento: 'PIX' | 'TED' | 'DINHEIRO' | 'BOLETO';
  descricao: string;
  observacao?: string;
}

export interface LancarConvenioCreditoResult {
  replayed: boolean;
  mes: ConvenioFinanceiroMes;
}

export interface FinalizarConvenioMesInput {
  requestId: string;
  competenciaId: string;
  criarProxima: boolean;
}

export interface FinalizarConvenioMesResult {
  replayed: boolean;
  mesFechado: ConvenioFinanceiroMes;
  proximaMes: ConvenioFinanceiroMes | null;
}
