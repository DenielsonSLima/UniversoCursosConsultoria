export type CaixaWorkspacePayablesFilter =
  | 'ATRASADAS'
  | 'HOJE'
  | 'PROXIMOS_7_DIAS'
  | 'COMPETENCIA'
  | 'PAGAS_COMPETENCIA'
  | 'A_VENCER_COMPETENCIA';

export interface CaixaWorkspacePayablesRequest {
  empresaId: string;
  poloId?: string | null;
  competencia: string;
  filtro: CaixaWorkspacePayablesFilter;
  pagina: number;
  tamanhoPagina: number;
  snapshotId?: string | null;
}

export interface CaixaWorkspacePayablesItem {
  chave: string;
  fonte: 'CONTA_PAGAR_LEGADA' | 'DESPESA' | 'RATEIO_ECONOMICO';
  polo: { id: string; nome: string };
  descricao: string;
  status: string;
  datas: {
    vencimento: string;
    pagamento: string | null;
    registro: string;
  };
  valor_programado: string;
  valor_pago: string;
  saldo_aberto: string;
}

export interface CaixaWorkspacePayablesPayload {
  versao: 2;
  meta: {
    snapshot_id: string;
    empresa_id: string;
    polo_id: string | null;
    escopo_tipo: 'GLOBAL' | 'POLO';
    competencia: string;
    periodo_inicio: string;
    periodo_fim_exclusivo: string;
    data_corte: string;
    data_institucional: string;
    timezone: 'America/Maceio';
    criterio: 'POSICAO_REEXPRESSA_NO_CORTE';
    unidade_contagem: 'LINHA_ECONOMICA';
    all_polos_admin_global_sistema: true;
  };
  filtro: CaixaWorkspacePayablesFilter;
  paginacao: {
    pagina: number;
    tamanho_pagina: number;
    total_itens: number;
    total_paginas: number;
    tem_anterior: boolean;
    tem_proxima: boolean;
  };
  itens: CaixaWorkspacePayablesItem[];
}
