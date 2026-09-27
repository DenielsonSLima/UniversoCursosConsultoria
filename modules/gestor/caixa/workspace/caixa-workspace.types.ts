export type CaixaWorkspaceMoney = string;
export type CaixaWorkspaceScopeType = 'GLOBAL' | 'POLO';

export type CaixaWorkspaceIncompleteCode =
  | 'OBRIGACOES_SEM_VENCIMENTO'
  | 'OBRIGACOES_SEM_DATA_REGISTRO'
  | 'PAGAMENTOS_SEM_DATA'
  | 'PAGAMENTOS_SEM_VALOR'
  | 'PAGAMENTOS_PARCIAIS_SEM_ESTADO_CANONICO'
  | 'CANCELAMENTOS_E_EXCLUSOES_SEM_VIGENCIA_HISTORICA';

export type CaixaWorkspaceAvailableSection<T> =
  | {
    disponivel: true;
    completo: true;
    motivo: null;
    observacao: string;
    dados: T;
  }
  | {
    disponivel: true;
    completo: false;
    motivo: 'DADOS_INCOMPLETOS';
    observacao: string;
    dados: T;
  };

export interface CaixaWorkspaceLaterSection {
  disponivel: false;
  completo: false;
  motivo: 'ETAPA_POSTERIOR';
  observacao: string;
  dados: null;
}

export interface CaixaWorkspaceMoneyCount {
  valor: CaixaWorkspaceMoney;
  quantidade: number;
}

export type CaixaWorkspaceConsideredSource =
  | { fonte: 'public.contas_pagar'; finalidade: 'TITULOS_LEGADOS' }
  | { fonte: 'public.despesas_lancamentos'; finalidade: 'DESPESAS' }
  | {
    fonte: 'public.despesas_lancamentos_rateios';
    finalidade: 'RATEIO_ECONOMICO';
  };

export type CaixaWorkspaceUnavailableSource =
  | { fonte: 'CONTAS_A_RECEBER_CANONICA'; motivo: 'ETAPA_POSTERIOR' }
  | { fonte: 'INADIMPLENCIA_CANONICA'; motivo: 'ETAPA_POSTERIOR' }
  | {
    fonte: 'VIGENCIA_HISTORICA_CANCELAMENTOS_EXCLUSOES';
    motivo: 'FONTE_NAO_BITEMPORAL';
  };

export interface CaixaWorkspacePayablesData {
  fontes_consideradas: CaixaWorkspaceConsideredSource[];
  fontes_indisponiveis: CaixaWorkspaceUnavailableSource[];
  motivos_incompletude: CaixaWorkspaceIncompleteCode[];
  criterio: 'POSICAO_REEXPRESSA_NO_CORTE';
  unidade_quantidade: 'TITULO_FISICO_SEM_DUPLICACAO';
  contas_competencia: CaixaWorkspaceMoneyCount;
  pagas_competencia: CaixaWorkspaceMoneyCount & {
    criterio_quantidade: 'TITULO_TOTALMENTE_PAGO_NO_CORTE';
  };
  a_vencer_competencia: CaixaWorkspaceMoneyCount;
  em_atraso: CaixaWorkspaceMoneyCount & {
    data_mais_antiga: string | null;
  };
}

export interface CaixaWorkspaceAgendaData {
  fontes_consideradas: CaixaWorkspaceConsideredSource[];
  fontes_indisponiveis: CaixaWorkspaceUnavailableSource[];
  motivos_incompletude: CaixaWorkspaceIncompleteCode[];
  unidade_quantidade: 'TITULO_FISICO_SEM_DUPLICACAO';
  hoje: CaixaWorkspaceMoneyCount & {
    data: string;
  };
  proximos_sete_dias: CaixaWorkspaceMoneyCount & {
    periodo_inicio: string;
    periodo_fim_exclusivo: string;
  };
  dias: Array<CaixaWorkspaceMoneyCount & {
    data: string;
  }>;
}

export interface CaixaWorkspaceCommitmentsData {
  fontes_consideradas: CaixaWorkspaceConsideredSource[];
  fontes_indisponiveis: CaixaWorkspaceUnavailableSource[];
  contas_a_pagar: CaixaWorkspaceAvailableSection<CaixaWorkspacePayablesData>;
  contas_a_receber: CaixaWorkspaceLaterSection;
  inadimplencia: CaixaWorkspaceLaterSection;
  agenda_financeira: CaixaWorkspaceAvailableSection<CaixaWorkspaceAgendaData>;
}

export interface CaixaWorkspaceCommitmentsSection {
  disponivel: true;
  completo: false;
  motivo: 'SUBSECOES_EM_ETAPA_POSTERIOR';
  observacao: string;
  dados: CaixaWorkspaceCommitmentsData;
}

export interface CaixaWorkspaceQualityData {
  fontes_consideradas: CaixaWorkspaceConsideredSource[];
  fontes_indisponiveis: CaixaWorkspaceUnavailableSource[];
  motivos_incompletude: CaixaWorkspaceIncompleteCode[];
  historico_contas_pagar_completo: boolean;
  obrigacoes_sem_vencimento: number;
  obrigacoes_sem_data_registro: number;
  pagamentos_sem_data: number;
  pagamentos_sem_valor: number;
  pagamentos_parciais_sem_estado: number;
}

export interface CaixaWorkspaceMeta {
  empresa_id: string;
  competencia: string;
  periodo_inicio: string;
  periodo_fim_exclusivo: string;
  data_corte: string;
  data_institucional: string;
  timezone: 'America/Maceio';
  snapshot_id: string;
  gerado_em: string;
  escopo_tipo: CaixaWorkspaceScopeType;
  polo_id: string | null;
  meses_historico: number;
  criterio_posicao: 'POSICAO_REEXPRESSA_NO_CORTE';
  criterio_historico: 'POSICAO_REEXPRESSA_NO_CORTE';
  criterio_realizado: 'PAGAMENTO_EFETIVO_ATE_CORTE';
}

export interface CaixaWorkspaceRules {
  compromissos_abertos_impactam_realizado: false;
  compromissos_abertos_impactam_posicoes: false;
  rateio_economico_duplica_baixa_fisica: false;
  moeda: 'DECIMAL_TEXT_2';
}

export interface CaixaWorkspaceSections {
  resumo_executivo: CaixaWorkspaceLaterSection;
  compromissos: CaixaWorkspaceCommitmentsSection;
  fluxo: CaixaWorkspaceLaterSection;
  cobertura: CaixaWorkspaceLaterSection;
  posicoes: CaixaWorkspaceLaterSection;
  operacoes: CaixaWorkspaceLaterSection;
  qualidade_dados: CaixaWorkspaceAvailableSection<CaixaWorkspaceQualityData>;
}

export interface CaixaWorkspacePayload {
  versao: 2;
  meta: CaixaWorkspaceMeta;
  regras: CaixaWorkspaceRules;
  secoes: CaixaWorkspaceSections;
}
