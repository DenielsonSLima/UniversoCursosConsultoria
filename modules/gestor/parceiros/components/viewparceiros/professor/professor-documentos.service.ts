import { supabase } from '../../../../../../lib/supabase';

export const PROFESSOR_DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
export const PROFESSOR_DOCUMENT_CATEGORIES = [
  { value: 'identificacao', label: 'Identificação' },
  { value: 'formacao', label: 'Formação' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'outro', label: 'Outro' },
] as const;
export type ProfessorDocumentoCategoria = typeof PROFESSOR_DOCUMENT_CATEGORIES[number]['value'];
export type ProfessorDocumentoStatus = 'pendente' | 'em_analise' | 'aprovado' | 'recusado';
export interface ProfessorDocumentoArquivo {
  id: string;
  bucket: string;
  path: string;
  nome: string;
  mimeType: string;
  tamanho: number;
  confirmadoEm: string;
}
export interface ProfessorDocumentoEvento {
  id: string;
  acao: 'solicitado' | 'enviado' | 'aprovado' | 'recusado';
  observacao: string | null;
  arquivoId: string | null;
  criadoEm: string;
}
export interface ProfessorDocumento {
  id: string;
  nome: string;
  categoria: ProfessorDocumentoCategoria;
  status: ProfessorDocumentoStatus;
  instrucao: string | null;
  observacaoRevisao: string | null;
  arquivoAtualId: string | null;
  criadoEm: string;
  atualizadoEm: string;
  arquivos: ProfessorDocumentoArquivo[];
  historico: ProfessorDocumentoEvento[];
}
export interface ProfessorDocumentosPainel {
  total: number;
  pendentes: number;
  emAnalise: number;
  aprovados: number;
  itens: ProfessorDocumento[];
}
export interface ProfessorDocumentoEnvio {
  documentoId: string;
  file: File;
  reservaRequestId: string;
  confirmarRequestId: string;
}

export const validateProfessorDocumentFile = (file: Pick<File, 'type' | 'size' | 'name'>) => {
  if (!PROFESSOR_DOCUMENT_ACCEPT.split(',').includes(file.type)) {
    throw new Error('Envie um arquivo PDF, JPG, PNG ou WEBP.');
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error('O arquivo deve ter conteúdo e no máximo 10 MB.');
  }
  if (!file.name.trim() || file.name.length > 240) {
    throw new Error('O nome do arquivo deve ter até 240 caracteres.');
  }
};

const operate = async <T>(
  professorId: string,
  action: string,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<T> => {
  const { data, error } = await supabase.rpc('gestor_operar_documento_professor', {
    p_professor_id: professorId,
    p_acao: action,
    p_payload: payload,
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as T;
};

export const professorDocumentosService = {
  async listar(professorId: string, offset: number): Promise<ProfessorDocumentosPainel> {
    const { data, error } = await supabase.rpc('gestor_listar_documentos_professor', {
      p_professor_id: professorId,
      p_offset: offset,
      p_limit: 20,
    });
    if (error) throw error;
    return data as ProfessorDocumentosPainel;
  },
  solicitar(
    professorId: string,
    input: { nome: string; categoria: ProfessorDocumentoCategoria; instrucao: string },
    requestId: string,
  ) {
    return operate<{ documentoId: string }>(professorId, 'solicitar', input, requestId);
  },
  async enviar(professorId: string, input: ProfessorDocumentoEnvio) {
    validateProfessorDocumentFile(input.file);
    const arquivo = await operate<{ id: string; bucket: string; path: string }>(
      professorId,
      'reservar',
      {
        documentoId: input.documentoId,
        nome: input.file.name,
        mimeType: input.file.type,
        tamanho: input.file.size,
      },
      input.reservaRequestId,
    );
    let uploadError: unknown;
    try {
      const uploaded = await supabase.storage.from(arquivo.bucket).upload(
        arquivo.path,
        input.file,
        { contentType: input.file.type, cacheControl: '3600', upsert: false },
      );
      uploadError = uploaded.error;
    } catch (failure) {
      uploadError = failure;
    }
    // Confirmar também após erro de transporte ou RLS do upload: a confirmação
    // original pode ter comitado e perdido a resposta. O replay ainda autoriza
    // o gestor, confere o payload e não modifica a versão atual novamente.
    try {
      return await operate(professorId, 'confirmar', {
        documentoId: input.documentoId,
        arquivoId: arquivo.id,
      }, input.confirmarRequestId);
    } catch (confirmationError) {
      const storageFailure = uploadError && typeof uploadError === 'object'
        ? uploadError as { statusCode?: string; message?: string }
        : null;
      const duplicate = storageFailure && (String(storageFailure.statusCode) === '409' ||
        storageFailure.message === 'The resource already exists');
      if (uploadError && !duplicate) throw uploadError;
      throw confirmationError;
    }
  },
  revisar(
    professorId: string,
    input: {
      documentoId: string;
      arquivoId: string;
      status: 'aprovado' | 'recusado';
      observacao: string;
    },
    requestId: string,
  ) {
    return operate(professorId, 'revisar', input, requestId);
  },
  async visualizar(arquivo: ProfessorDocumentoArquivo) {
    const { data, error } = await supabase.storage.from(arquivo.bucket).createSignedUrl(
      arquivo.path,
      300,
    );
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Não foi possível abrir o arquivo. Tente novamente.');
    return data.signedUrl;
  },
};
