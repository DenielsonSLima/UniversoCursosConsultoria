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
  created_at?: string;
  modulos?: Modulo[];
  ead_config?: EadConfig;
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
  tipo: 'video' | 'material' | 'ambos';
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

export interface EadCertificacao {
  emitirAutomatico: boolean;
  minimoAproveitamento: number; // percentual de aprovação necessário, ex: 70
  assinaturaUrl?: string;
  textoCustomizado?: string;
}

export interface EadConfig {
  cronograma: EadCronogramaItem[];
  conteudos: EadConteudoItem[];
  provas: EadProva[];
  certificacao: EadCertificacao;
}
