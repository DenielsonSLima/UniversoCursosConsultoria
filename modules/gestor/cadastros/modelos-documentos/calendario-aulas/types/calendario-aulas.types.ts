export type StatusModeloCalendario = 'RASCUNHO' | 'ATIVO' | 'EM_REVISAO';

export interface CabecalhosTabelaCalendario {
  componente: string;
  data: string;
  horario: string;
  professorObservacao: string;
}

export interface ConteudoModeloCalendarioAulas {
  nomeModelo: string;
  titulo: string;
  subtitulo: string;
  rodape: string;
  observacaoSemHorario: string;
  orientacao: 'A4_RETRATO';
  exibirMarcaDagua: boolean;
  exibirModulo: boolean;
  cabecalhosTabela: CabecalhosTabelaCalendario;
}

export interface ModeloCalendarioAulasSeguro {
  templateKey: 'calendario_aulas';
  revisao: number;
  status: StatusModeloCalendario;
  atualizadoEm: string | null;
  atualizadoPorNome: string | null;
  conteudo: ConteudoModeloCalendarioAulas;
}

export interface SalvarModeloCalendarioAulasInput {
  revisaoEsperada: number;
  conteudo: ConteudoModeloCalendarioAulas;
  requestId: string;
}
