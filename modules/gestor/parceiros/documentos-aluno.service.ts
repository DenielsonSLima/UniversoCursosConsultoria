import { supabase } from '../../../lib/supabase';
import { errorMessage, getFileExtension } from './utils/file-utils';

const PRIVATE_STUDENT_DOCUMENTS_BUCKET = 'documentos-alunos';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type DocumentoAlunoStatus = 'pendente' | 'aprovado' | 'recusado';

export interface DocumentoAluno {
  id: string;
  alunoId: string;
  nome: string;
  status: DocumentoAlunoStatus;
  arquivoUrl: string | null;
  observacao: string | null;
  updatedAt: string | null;
  revisadoEm: string | null;
}

export type MatriculaTecnicaWorkflowBloqueio =
  | 'SEM_PERMISSAO'
  | 'FLUXO_NAO_REGULAR'
  | 'STATUS_INCOMPATIVEL'
  | 'TURMA_FORA_DE_ANDAMENTO'
  | 'PAGAMENTO_PENDENTE'
  | 'DOCUMENTACAO_INCOMPLETA'
  | 'DADOS_PESSOAIS_INCOMPLETOS'
  | 'ENVIO_DOCUMENTAL_EM_ANDAMENTO'
  | 'COBRANCA_EXISTENTE'
  | 'LIBERACAO_JA_ATIVA'
  | 'LIBERACAO_INATIVA_OU_SEM_PERMISSAO';

interface MatriculaTecnicaWorkflowAcao {
  permitida: boolean;
  bloqueios: MatriculaTecnicaWorkflowBloqueio[];
}

export interface MatriculaTecnicaPendenteDocumento {
  matriculaId: string;
  alunoId: string;
  turmaId: string;
  turmaNome: string;
  cursoNome: string;
  status: string;
  turmaStatus: string;
  fluxo: 'REGULAR' | 'IMPLANTACAO';
  pagamento: {
    estado: 'CONFIRMADO' | 'PENDENTE' | 'NAO_APLICAVEL';
  };
  documentacao: {
    concluida: boolean;
    obrigatoriosTotal: number;
    concluidos: number;
    pendentes: number;
    dadosPessoaisPendentes: boolean;
    envioEmAndamento: boolean;
  };
  liberacaoAcademica: {
    id: string;
    ativa: true;
    liberadoEm: string;
    liberadoPorNome: string | null;
    motivo: string;
  } | null;
  acoes: {
    ativarRegular: MatriculaTecnicaWorkflowAcao;
    liberarImplantacao: MatriculaTecnicaWorkflowAcao;
    revogarLiberacao: MatriculaTecnicaWorkflowAcao;
  };
}

const normalizeDocumentStatus = (status?: string | null): DocumentoAlunoStatus => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'aprovado') return 'aprovado';
  if (normalized === 'recusado' || normalized === 'rejeitado') return 'recusado';
  return 'pendente';
};

const createDocumentUrl = async (row: any): Promise<string | null> => {
  if (!row.arquivo_bucket || !row.arquivo_path) {
    return row.arquivo_url || null;
  }

  const { data, error } = await supabase.storage
    .from(row.arquivo_bucket)
    .createSignedUrl(row.arquivo_path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('Erro ao assinar URL privada do documento:', error);
    return row.arquivo_url || null;
  }

  return data?.signedUrl || row.arquivo_url || null;
};

const validateDocumentFile = (file: File) => {
  if (!ACCEPTED_DOCUMENT_TYPES.has(file.type)) {
    throw new Error('Envie um arquivo PDF, JPG, PNG ou WEBP.');
  }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error('O arquivo deve ter no máximo 10 MB.');
  }
};

export const documentosAlunoService = {
  async getMatriculasTecnicasPendentes(alunoId: string): Promise<MatriculaTecnicaPendenteDocumento[]> {
    const { data, error } = await supabase.rpc(
      'listar_fluxos_matriculas_tecnicas',
      { p_aluno_id: alunoId },
    );
    if (error) throw error;
    return (data || []) as MatriculaTecnicaPendenteDocumento[];
  },

  async ativarMatriculaTecnicaAposDocumentos(
    matriculaId: string,
  ): Promise<MatriculaTecnicaPendenteDocumento> {
    const { data, error } = await supabase.rpc('ativar_matricula_tecnica_apos_documentos', {
      p_matricula_id: matriculaId,
    });
    if (error) throw new Error(errorMessage(error, 'Não foi possível ativar a matrícula'));
    return data as MatriculaTecnicaPendenteDocumento;
  },

  async liberarMatriculaImplantacao(
    matriculaId: string,
    motivo: string,
  ): Promise<MatriculaTecnicaPendenteDocumento> {
    const { data, error } = await supabase.rpc('liberar_matricula_implantacao', {
      p_matricula_id: matriculaId,
      p_motivo: motivo.trim(),
    });
    if (error) {
      throw new Error(
        errorMessage(error, 'Não foi possível liberar o acesso acadêmico'),
      );
    }
    return data as MatriculaTecnicaPendenteDocumento;
  },

  async revogarLiberacaoImplantacao(
    matriculaId: string,
    motivo: string,
  ): Promise<MatriculaTecnicaPendenteDocumento> {
    const { data, error } = await supabase.rpc('set_matricula_liberacao_diario', {
      p_matricula_id: matriculaId,
      p_liberada: false,
      p_motivo: motivo.trim(),
    });
    if (error) {
      throw new Error(
        errorMessage(error, 'Não foi possível revogar o acesso acadêmico'),
      );
    }
    return data as MatriculaTecnicaPendenteDocumento;
  },

  async getDocumentos(alunoId: string): Promise<DocumentoAluno[]> {
    const { data, error } = await supabase
      .from('documentos_aluno')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('nome_documento', { ascending: true });

    if (error) {
      console.error('Erro ao buscar documentos do aluno:', error);
      throw error;
    }

    return Promise.all((data || []).map(async (row: any) => ({
      id: row.id,
      alunoId: row.aluno_id,
      nome: row.nome_documento,
      status: normalizeDocumentStatus(row.status),
      arquivoUrl: await createDocumentUrl(row),
      observacao: row.observacao || null,
      updatedAt: row.updated_at || null,
      revisadoEm: row.revisado_em || null,
    })));
  },

  async updateDocumentoStatus(
    docId: string,
    status: Exclude<DocumentoAlunoStatus, 'pendente'>,
    observacao?: string,
  ) {
    if (!['aprovado', 'recusado'].includes(status)) {
      throw new Error('Selecione uma decisão válida para o documento.');
    }

    const { data, error } = await supabase.rpc('revisar_documento_aluno', {
      p_documento_id: docId,
      p_status: status,
      p_observacao: observacao?.trim() || null,
    });

    if (error) {
      console.error('Erro ao revisar documento:', error);
      throw new Error(errorMessage(error, 'Não foi possível revisar o documento'));
    }

    return data;
  },

  async uploadDocumento(alunoId: string, docName: string, file: File) {
    if (!alunoId) throw new Error('Aluno não identificado para vincular o documento.');
    if (!docName) throw new Error('Documento não identificado para upload.');
    if (!file) throw new Error('Selecione um arquivo para enviar.');
    validateDocumentFile(file);

    const { data: documentRow, error: documentError } = await supabase
      .from('documentos_aluno')
      .select('id, aluno_id, nome_documento')
      .eq('aluno_id', alunoId)
      .eq('nome_documento', docName)
      .maybeSingle();

    if (documentError) {
      throw new Error(errorMessage(documentError, 'Não foi possível localizar o item do checklist'));
    }
    if (!documentRow) {
      throw new Error(`O documento "${docName}" não pertence ao checklist deste aluno.`);
    }

    const fileExt = getFileExtension(file, file.type === 'application/pdf' ? 'pdf' : 'jpg');
    const filePath = `${alunoId}/documentos/${documentRow.id}_${Date.now()}.${fileExt}`;
    const storage = supabase.storage.from(PRIVATE_STUDENT_DOCUMENTS_BUCKET);
    const { data: uploaded, error: uploadError } = await storage.upload(filePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      console.error('Erro no upload do documento privado:', uploadError);
      throw new Error(errorMessage(uploadError, 'Não foi possível enviar o arquivo para o storage'));
    }
    if (!uploaded?.path) {
      throw new Error('Arquivo enviado, mas o storage não retornou o caminho do arquivo.');
    }

    const { error: linkError } = await supabase.rpc('registrar_envio_documento_aluno', {
      p_documento_id: documentRow.id,
      p_bucket: PRIVATE_STUDENT_DOCUMENTS_BUCKET,
      p_path: uploaded.path,
    });

    if (linkError) {
      await storage.remove([uploaded.path]).catch(() => undefined);
      console.error('Erro ao vincular documento privado:', linkError);
      throw new Error(errorMessage(linkError, 'Arquivo enviado, mas não foi possível vinculá-lo ao checklist'));
    }

    const { data: signed, error: signedError } = await storage.createSignedUrl(
      uploaded.path,
      SIGNED_URL_TTL_SECONDS,
    );

    if (signedError) {
      console.warn('Documento vinculado, mas a URL temporária não pôde ser criada:', signedError);
    }

    return signed?.signedUrl || null;
  },
};
