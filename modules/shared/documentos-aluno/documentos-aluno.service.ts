import { supabase } from '../../../lib/supabase';
import { validarArquivosDocumentoAluno, validarMapeamentosDocumentoAluno } from './documentos-aluno.validation';
import {
  createDocumentoAlunoSignedUrl,
  removeReservasDocumentoAluno,
  uploadArquivoDocumentoAluno,
} from './documentos-aluno.storage';
import type {
  DocumentoAlunoDecisaoRevisao,
  DocumentoAlunoLoteCriado,
  DocumentoAlunoMapeamentoPagina,
  DocumentoAlunoPainel,
  DocumentoAlunoRecebimentoSemAnexo,
} from './documentos-aluno.types';

const throwIfError = (error: unknown) => {
  if (error) throw error;
};

const cancelarLoteComReservas = async (
  loteId: string,
  arquivos: Array<{ bucket: string; path: string }>,
  motivo: string,
) => {
  const { error: cancelError } = await supabase.rpc(
    'cancelar_lote_documentos_aluno',
    {
      p_lote_id: loteId,
      p_motivo: motivo,
    },
  );
  throwIfError(cancelError);
  await removeReservasDocumentoAluno(arquivos);
};

const throwUploadAndCleanupError = (uploadError: unknown, cleanupError: unknown): never => {
  const uploadMessage = uploadError instanceof Error
    ? uploadError.message
    : 'Falha durante o envio.';
  const cleanupMessage = cleanupError instanceof Error
    ? cleanupError.message
    : 'Falha ao cancelar o envio incompleto.';
  throw new Error(`${uploadMessage} O envio incompleto não pôde ser cancelado: ${cleanupMessage}`);
};

export const documentosAlunoV2Service = {
  async getPainel(
    alunoId?: string | null,
    options?: { includeLegacyReceipts?: boolean },
  ) {
    const painelResult = await supabase.rpc('listar_painel_documentos_aluno', {
      p_aluno_id: alunoId || null,
    });
    throwIfError(painelResult.error);

    const painel = painelResult.data as DocumentoAlunoPainel;
    if (!options?.includeLegacyReceipts) {
      return painel;
    }

    const [recebimentosResult, elegibilidadeResult] = await Promise.all([
      supabase.rpc('listar_documentos_recebidos_sem_anexo', {
        p_aluno_id: alunoId || null,
      }),
      supabase.rpc('aluno_pode_registrar_documento_sem_anexo', {
        p_aluno_id: alunoId || null,
      }),
    ]);
    throwIfError(recebimentosResult.error);
    throwIfError(elegibilidadeResult.error);

    const recebimentos = (recebimentosResult.data || []) as Array<{
        id: string;
        documento_id: string;
        aluno_id: string;
        origem: DocumentoAlunoRecebimentoSemAnexo['origem'];
        motivo: string;
        recebido_em: string;
        recebido_por_nome?: string | null;
      }>;
    const recebimentosPorDocumento = new Map(
      recebimentos.map((recebimento) => [
        recebimento.documento_id,
        {
          id: recebimento.id,
          documentoId: recebimento.documento_id,
          alunoId: recebimento.aluno_id,
          origem: recebimento.origem,
          motivo: recebimento.motivo,
          recebidoEm: recebimento.recebido_em,
          recebidoPorNome: recebimento.recebido_por_nome || null,
        } satisfies DocumentoAlunoRecebimentoSemAnexo,
      ]),
    );

    return {
      ...painel,
      podeRegistrarRecebimentoSemAnexo:
        elegibilidadeResult.data === true,
      itens: painel.itens.map((item) => {
        const recebimentoSemAnexo =
          recebimentosPorDocumento.get(item.id) || null;
        return {
          ...item,
          status: recebimentoSemAnexo ? 'aprovado' : item.status,
          recebimentoSemAnexo,
        };
      }),
    } satisfies DocumentoAlunoPainel;
  },

  getArquivoUrl: createDocumentoAlunoSignedUrl,

  async uploadSeparado(documentoId: string, files: File[]) {
    validarArquivosDocumentoAluno(files, 'separado');
    const { data: created, error: createError } = await supabase.rpc(
      'iniciar_envio_documentos_aluno',
      {
        p_modo: 'separado',
        p_documento_ids: [documentoId],
      },
    );
    throwIfError(createError);
    const lote = created as DocumentoAlunoLoteCriado;

    const arquivos = [];
    try {
      for (const file of files) {
        await uploadArquivoDocumentoAluno(
          lote.id,
          file,
          (arquivo) => arquivos.push(arquivo),
        );
      }

      const { error: finishError } = await supabase.rpc(
        'finalizar_envio_documentos_separados',
        {
          p_lote_id: lote.id,
          p_fontes: [{
            documento_id: documentoId,
            arquivo_ids: arquivos.map((arquivo) => arquivo.id),
          }],
        },
      );
      throwIfError(finishError);
      return lote.id;
    } catch (error) {
      try {
        await cancelarLoteComReservas(
          lote.id,
          arquivos,
          'Falha durante o envio pelo portal.',
        );
      } catch (cleanupError) {
        throwUploadAndCleanupError(error, cleanupError);
      }
      throw error;
    }
  },

  async uploadPdfUnico(documentoIds: string[], file: File) {
    validarArquivosDocumentoAluno([file], 'pdf_unico');
    if (!documentoIds.length) {
      throw new Error('Não há itens liberados para receber este PDF.');
    }

    const { data: created, error: createError } = await supabase.rpc(
      'iniciar_envio_documentos_aluno',
      {
        p_modo: 'pdf_unico',
        p_documento_ids: documentoIds,
      },
    );
    throwIfError(createError);
    const lote = created as DocumentoAlunoLoteCriado;
    const arquivos = [];
    try {
      const arquivo = await uploadArquivoDocumentoAluno(
        lote.id,
        file,
        (reservado) => arquivos.push(reservado),
      );

      const { error: finishError } = await supabase.rpc(
        'finalizar_envio_pdf_unico',
        {
          p_lote_id: lote.id,
          p_arquivo_id: arquivo.id,
        },
      );
      throwIfError(finishError);
      return lote.id;
    } catch (error) {
      try {
        await cancelarLoteComReservas(
          lote.id,
          arquivos,
          'Falha durante o envio do PDF consolidado.',
        );
      } catch (cleanupError) {
        throwUploadAndCleanupError(error, cleanupError);
      }
      throw error;
    }
  },

  async cancelarLote(
    loteId: string,
    arquivos: Array<{ bucket: string; path: string }>,
  ) {
    await cancelarLoteComReservas(
      loteId,
      arquivos,
      'Cancelado pelo aluno antes da conclusão do envio.',
    );
  },

  async cancelarLoteComoGestor(
    loteId: string,
    arquivoIds: string[],
    motivo: string,
  ) {
    const { error: cancelError } = await supabase.rpc(
      'cancelar_lote_documentos_aluno',
      {
        p_lote_id: loteId,
        p_motivo: motivo.trim(),
      },
    );
    throwIfError(cancelError);
    if (!arquivoIds.length) return [];
    return this.excluirArquivos(arquivoIds, `Lote cancelado: ${motivo.trim()}`);
  },

  async definirTotalPaginas(arquivoId: string, totalPaginas: number) {
    const { data, error } = await supabase.rpc(
      'definir_total_paginas_arquivo_documento_aluno',
      {
        p_arquivo_id: arquivoId,
        p_total_paginas: totalPaginas,
      },
    );
    throwIfError(error);
    return data;
  },

  async mapearPdf(
    loteId: string,
    mappings: DocumentoAlunoMapeamentoPagina[],
    totalPaginas: number,
  ) {
    validarMapeamentosDocumentoAluno(mappings, totalPaginas);
    const { data, error } = await supabase.rpc(
      'mapear_paginas_pdf_documento_aluno',
      {
        p_lote_id: loteId,
        p_mapeamentos: mappings.map((mapping) => ({
          documento_id: mapping.documentoId,
          pagina_inicio: mapping.paginaInicial,
          pagina_fim: mapping.paginaFinal,
        })),
      },
    );
    throwIfError(error);
    return data;
  },

  async revisar(
    versaoId: string,
    status: DocumentoAlunoDecisaoRevisao,
    observacao?: string,
  ) {
    const { data, error } = await supabase.rpc(
      'revisar_versao_documento_aluno',
      {
        p_versao_id: versaoId,
        p_status: status,
        p_observacao: observacao?.trim() || null,
      },
    );
    throwIfError(error);
    return data;
  },

  async marcarRecebidoSemAnexo(documentoId: string, motivo: string) {
    const { data, error } = await supabase.rpc(
      'marcar_documento_recebido_sem_anexo',
      {
        p_documento_id: documentoId,
        p_motivo: motivo.trim(),
      },
    );
    throwIfError(error);
    return data;
  },

  async revogarRecebidoSemAnexo(documentoId: string, motivo: string) {
    const { data, error } = await supabase.rpc(
      'revogar_documento_recebido_sem_anexo',
      {
        p_documento_id: documentoId,
        p_motivo: motivo.trim(),
      },
    );
    throwIfError(error);
    return data;
  },

  async arquivar(versaoId: string, motivo: string) {
    const { data, error } = await supabase.rpc(
      'arquivar_versao_documento_aluno',
      {
        p_versao_id: versaoId,
        p_motivo: motivo.trim(),
      },
    );
    throwIfError(error);
    return data;
  },

  async excluirArquivos(arquivoIds: string[], motivo: string) {
    const distinctIds = [...new Set(arquivoIds)];
    const { data: exclusions, error: requestError } = await supabase.rpc(
      'solicitar_exclusao_arquivos_documento_aluno',
      {
        p_arquivo_ids: distinctIds,
        p_motivo: motivo.trim(),
      },
    );
    throwIfError(requestError);

    const results = await Promise.allSettled(
      (exclusions as Array<{ id: string }>).map((exclusion) =>
        supabase.functions.invoke(
          'documentos-aluno-admin',
          { body: { exclusaoId: exclusion.id } },
        )),
    );
    const failed = results.find((result) =>
      result.status === 'rejected'
      || result.value.error
      || !result.value.data?.success);
    if (failed) {
      throw new Error(
        'A exclusão foi registrada, mas um arquivo aguarda nova tentativa administrativa.',
      );
    }
    return results.map((result) => result.status === 'fulfilled' ? result.value.data : null);
  },
};
