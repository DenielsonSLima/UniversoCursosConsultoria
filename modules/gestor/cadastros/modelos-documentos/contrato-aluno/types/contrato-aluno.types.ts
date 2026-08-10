export const CONTRATO_ALUNO_MODALIDADES = ['TECNICO', 'LIVRE', 'SUPERIOR'] as const;

export type ContratoAlunoModalidade = (typeof CONTRATO_ALUNO_MODALIDADES)[number];

export const CONTRATO_ALUNO_MODALIDADE_LABEL: Record<ContratoAlunoModalidade, string> = {
  TECNICO: 'Curso técnico',
  LIVRE: 'Curso livre',
  SUPERIOR: 'Especialização',
};

export type ModeloDocumentoStatus = 'RASCUNHO' | 'ATIVO' | 'EM_REVISAO';
export type FonteModeloContrato = 'MINUTA_TECNICA' | 'AGUARDANDO_REVISAO_JURIDICA';
export type ModoValidadeDocumento = 'SEM_VENCIMENTO' | 'POR_DIAS';

export interface ConfiguracaoQrContrato {
  habilitado: boolean;
  rotulo: string;
  caminhoValidacao: string;
  modoValidade: ModoValidadeDocumento;
  diasValidade: number | null;
}

export interface ConfiguracaoMarcaDaguaContrato {
  habilitada: boolean;
  intensidade: 'SUAVE' | 'MEDIA';
  origem: 'POLO_EMISSOR';
}

export interface RegrasDinamicasContratoAluno {
  minimoAlunosTurma: number | string;
  prazoReembolsoDiasUteis: number | string;
  prazoRematriculaDias: number | string;
  percentualCancelamento: number | string;
  frequenciaEstagioObrigatoria: number | string;
  frequenciaTeoricaMinima: number | string;
  cargaSaudeColetiva: string;
  honorariosCobrancaPercentual: number | string;
  multaBibliotecaDia: string;
}

export interface FonteDocumentoContratoAluno {
  filename: string;
  sha256: string;
  sourceDocxSha256?: string;
}

export interface ConteudoModeloContratoAluno {
  /** Espelho visual do estado devolvido pelo servidor; não autoriza emissão. */
  status: ModeloDocumentoStatus;
  tituloDocumento: string;
  cabecalho: string;
  corpo: string;
  /** Expressões exatas exibidas em vermelho, uma por item. */
  destaquesCriticos: string[];
  /** Âncoras dos três parágrafos exibidos com realce rosa discreto. */
  destaquesAtencao: string[];
  rodape: string;
  observacaoEscopo: string;
  fonte: FonteModeloContrato;
  presentationVersion: 'CONTRATO_A4_INSTITUCIONAL_V2' | 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA';
  regrasDinamicas: RegrasDinamicasContratoAluno;
  sourceDocument: FonteDocumentoContratoAluno | null;
  marcaDagua: ConfiguracaoMarcaDaguaContrato;
  qr: ConfiguracaoQrContrato;
}

export interface ModeloDocumentoSeguro<TConteudo> {
  templateKey: string;
  modalidade: ContratoAlunoModalidade | null;
  revisao: number;
  status: ModeloDocumentoStatus;
  atualizadoEm: string | null;
  atualizadoPorNome: string | null;
  conteudo: TConteudo;
}

export interface SalvarModeloDocumentoSeguroInput<TConteudo> {
  templateKey: string;
  modalidade: ContratoAlunoModalidade | null;
  revisaoEsperada: number;
  conteudo: TConteudo;
  requestId: string;
}
