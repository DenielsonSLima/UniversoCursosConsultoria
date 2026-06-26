// File: modules/gestor/cadastros/cadastros.types.ts

export interface Aula {
  id: string;
  titulo: string;
  cargaHoraria: number;
  descricao?: string;
}

export interface Disciplina {
  id: string;
  nome: string;
  cargaHoraria: number;
  cargaHorariaTeoria?: number;
  cargaHorariaPratica?: number;
  cargaHorariaEstagio?: number;
  descricao?: string;
  aulas: Aula[];
}

export interface Modulo {
  id: string;
  nome: string;
  descricao?: string;
  disciplinas: Disciplina[];
}

export interface CursoFinanceiroConfig {
  valorBase: number;
  descontoPontualidade: number;
  parcelasPadrao: number;
  taxaPagaPor: 'aluno' | 'instituicao';
  metodosRecebimento: {
    pix: boolean;
    boleto: boolean;
    cartao: boolean;
  };
  descontoMetodo: {
    pix: boolean;
    boleto: boolean;
    cartao: boolean;
  };
  cartao: {
    aceitar: boolean;
    maxParcelas: number;
    aplicarDescontoPontualidade: boolean;
  };
  asaas: {
    gerarParcelamentoMensalidades: boolean;
    tipoCarnePreferencial: 'PARCELAMENTO' | 'COBRANCAS_AVULSAS';
  };
}

export interface Curso {
  id: string;
  nome: string;
  modalidade: 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO' | 'EAD' | 'SUPERIOR';
  carga_horaria: number;
  status: 'ativo' | 'inativo';
  area?: string;
  descricao?: string;
  versao?: string;
  parceiro_instituicao?: string;
  parceiro_logo_url?: string;
  imagem_url?: string;
  duracao_meses?: number;
  total_turmas?: number;
  carga_horaria_cadastrada?: number;
  publicar_site?: boolean;
  imagem_detalhe_1?: string;
  imagem_detalhe_2?: string;
  valor?: number | null;
  asaas_payment_link_id?: string | null;
  asaas_payment_link_url?: string | null;
  asaas_link_status?: string | null;
  created_at?: string;
  modulos?: Modulo[];
  ead_config?: EadConfig;
  financeiro_config?: CursoFinanceiroConfig;
}

export interface EadCronogramaItem {
  id: string;
  titulo: string;
  cargaHoraria: number;
}

export interface EadConteudoItem {
  id: string;
  titulo: string;
  descricao?: string;
  videoUrl?: string; // Links do YouTube/Vimeo
  apostilaUrl?: string; // Anexo da apostila
  textoHtml?: string;
  etapa?: number;
  duracaoMinutos?: number;
  objetivos?: string[];
  atividadeIds?: string[];
  tipo: 'video' | 'material' | 'ambos' | 'pagina';
}

export interface EadQuestao {
  id: string;
  pergunta: string;
  opcoes: string[];
  respostaCorreta: number; // 0-3 (índice da opção correta)
}

export interface EadProva {
  id: string;
  titulo: string;
  notaMinima: number; // percentual de acertos necessário para aprovação, ex: 70%
  questoes: EadQuestao[];
}

export interface EadAtividade {
  id: string;
  etapaId?: string;
  titulo: string;
  enunciado: string;
  tipo: 'reflexao' | 'multipla_escolha';
  opcoes?: string[];
  respostaCorreta?: number;
}

export interface EadPaginaCurso {
  subtitulo?: string;
  objetivos?: string[];
  publicoAlvo?: string;
  requisitos?: string;
  metodologia?: string;
  imagemGaleria?: string[];
}

export interface EadRegrasAprendizagem {
  tempoMinimoMinutos: number;
  liberarSequencialmente: boolean;
  exigirAtividades: boolean;
  exigirVideosConcluidos: boolean;
  intervaloReprovacaoHoras?: number;
}

export interface EadCertificacao {
  emitirAutomatico: boolean;
  minimoAproveitamento: number; // percentual de aprovação necessário, ex: 70
  modeloDocumento?: 'certificado_ead';
  assinaturaUrl?: string;
  textoCustomizado?: string;
}

export interface EadConfig {
  pagina?: EadPaginaCurso;
  regras?: EadRegrasAprendizagem;
  cronograma: EadCronogramaItem[];
  conteudos: EadConteudoItem[];
  atividades?: EadAtividade[];
  provas: EadProva[];
  certificacao: EadCertificacao;
}
