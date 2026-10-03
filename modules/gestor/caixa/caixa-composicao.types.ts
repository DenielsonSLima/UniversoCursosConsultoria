export type CaixaComposicaoMoney = string;

export interface CaixaComposicaoDados {
  total: CaixaComposicaoMoney;
  quantidade: number;
  base: CaixaComposicaoMoney | null;
  juros: CaixaComposicaoMoney | null;
  multa: CaixaComposicaoMoney | null;
  acrescimo: CaixaComposicaoMoney | null;
  desconto: CaixaComposicaoMoney | null;
  diferenca_a_conferir: CaixaComposicaoMoney | null;
  quantidade_a_conferir: number;
  /** Contagens canônicas obrigatórias no payload v2; ausentes no v1. */
  quantidade_sem_detalhamento?: number;
  quantidade_com_diferenca?: number;
}

export type CaixaComposicaoSecao =
  | {
    disponivel: true;
    completo: true;
    motivo: null;
    observacao: null;
    dados: CaixaComposicaoDados;
  }
  | {
    disponivel: true;
    completo: false;
    motivo: 'DADOS_INCOMPLETOS';
    observacao: string;
    dados: CaixaComposicaoDados;
  }
  | {
    disponivel: false;
    completo: false;
    motivo: 'FONTE_INDISPONIVEL';
    observacao: string;
    dados: null;
  };

/**
 * Contratos físicos v1/v2 da composição mensal; a leitura usa a RPC v2.
 *
 * Valores monetários chegam prontos do backend como texto decimal com duas
 * casas. Campos nulos não foram comprovados e nunca devem ser recalculados no
 * cliente.
 */
export interface CaixaComposicaoMensalPayload {
  versao: 1 | 2;
  competencia: string;
  periodo_inicio: string;
  periodo_fim_exclusivo: string;
  escopo_tipo: 'GLOBAL' | 'POLO';
  polo_id: string | null;
  gerado_em: string;
  recebimentos: CaixaComposicaoSecao;
  despesas: CaixaComposicaoSecao;
}
