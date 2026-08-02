export type DocumentoAlunoStatus =
  | 'nao_enviado'
  | 'pendente'
  | 'aprovado'
  | 'recusado'
  | 'arquivado';

export type DocumentoAlunoModoEnvio = 'separado' | 'pdf_unico';

export type DocumentoAlunoArquivoStatus =
  | 'reservado'
  | 'enviado'
  | 'exclusao_pendente'
  | 'excluido';

export interface DocumentoAlunoArquivo {
  id: string;
  nome: string;
  mimeType: string;
  url: string | null;
  bucket?: string | null;
  path?: string | null;
  status?: DocumentoAlunoArquivoStatus;
  tamanhoBytes?: number | null;
  totalPaginas?: number | null;
}

export interface DocumentoAlunoFonte {
  id: string;
  arquivo: DocumentoAlunoArquivo;
  paginaInicio?: number | null;
  paginaFim?: number | null;
  ordem: number;
}

export interface DocumentoAlunoVersao {
  id: string;
  numero: number;
  status: Exclude<DocumentoAlunoStatus, 'nao_enviado'>;
  enviadoEm: string;
  enviadoPorNome?: string | null;
  revisadoEm?: string | null;
  revisadoPorNome?: string | null;
  motivoRecusa?: string | null;
  motivoArquivamento?: string | null;
  fontes: DocumentoAlunoFonte[];
}

export interface DocumentoAlunoRecebimentoSemAnexo {
  id: string;
  documentoId: string;
  alunoId: string;
  origem:
    | 'GESTOR_CONFIRMACAO_SEM_ANEXO'
    | 'GESTOR_MIGRACAO_LEGADA'
    | 'MIGRACAO_LEGADA_T41';
  motivo: string;
  recebidoEm: string;
  recebidoPorNome?: string | null;
}

export interface DocumentoAlunoChecklistItem {
  id: string;
  nome: string;
  codigo?: string;
  regraObrigatoriedade?:
    | 'OBRIGATORIO'
    | 'MAIOR_18'
    | 'HOMEM_MAIOR_18'
    | 'OPCIONAL';
  aplicavel?: boolean | null;
  obrigatorio?: boolean;
  status: DocumentoAlunoStatus;
  versaoAtual: DocumentoAlunoVersao | null;
  versoes: DocumentoAlunoVersao[];
  recebimentoSemAnexo?: DocumentoAlunoRecebimentoSemAnexo | null;
}

export interface DocumentoAlunoResumo {
  total: number;
  naoEnviados: number;
  pendentes: number;
  aprovados: number;
  recusados: number;
  arquivados: number;
}

export interface DocumentoAlunoPdfMapeamento {
  id: string;
  checklistItemId: string;
  paginaInicio: number;
  paginaFim: number;
}

export interface DocumentoAlunoMapeamentoPagina {
  documentoId: string;
  paginaInicial: number;
  paginaFinal: number;
}

export type DocumentoAlunoLoteStatus =
  | 'preparando'
  | 'aguardando_mapeamento'
  | 'finalizado'
  | 'cancelado'
  | 'arquivado';

export interface DocumentoAlunoLotePdf {
  id: string;
  modo: DocumentoAlunoModoEnvio;
  status: DocumentoAlunoLoteStatus;
  documentoIds: string[];
  criadoEm: string;
  finalizadoEm?: string | null;
  arquivos: DocumentoAlunoArquivo[];
}

export interface DocumentoAlunoPainel {
  alunoId: string;
  itens: DocumentoAlunoChecklistItem[];
  lotesPdf: DocumentoAlunoLotePdf[];
  podeRegistrarRecebimentoSemAnexo?: boolean;
}

export interface DocumentoAlunoArquivoReservado {
  id: string;
  lote_id: string;
  aluno_id: string;
  bucket: string;
  path: string;
  nome_original: string;
  mime_type: string;
  tamanho_declarado: number;
}

export interface DocumentoAlunoLoteCriado {
  id: string;
  aluno_id: string;
  modo: DocumentoAlunoModoEnvio;
  status: DocumentoAlunoLoteStatus;
  documento_ids: string[];
}

export type DocumentoAlunoDecisaoRevisao = 'aprovado' | 'recusado';
