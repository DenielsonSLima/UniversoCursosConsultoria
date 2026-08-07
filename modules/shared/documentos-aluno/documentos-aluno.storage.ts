import { supabase } from '../../../lib/supabase';
import { DOCUMENTOS_ALUNO_BUCKET } from './documentos-aluno.constants';
import type {
  DocumentoAlunoArquivo,
  DocumentoAlunoArquivoReservado,
  DocumentoAlunoPainel,
} from './documentos-aluno.types';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const uploadArquivoDocumentoAluno = async (
  loteId: string,
  file: File,
  onReserved?: (arquivo: DocumentoAlunoArquivoReservado) => void,
) => {
  const { data: reserved, error: reserveError } = await supabase.rpc(
    'reservar_arquivo_documento_aluno',
    {
      p_lote_id: loteId,
      p_nome_original: file.name,
      p_mime_type: file.type,
      p_tamanho_declarado: file.size,
    },
  );
  if (reserveError) throw reserveError;

  const arquivo = reserved as DocumentoAlunoArquivoReservado;
  onReserved?.(arquivo);
  const storage = supabase.storage.from(arquivo.bucket || DOCUMENTOS_ALUNO_BUCKET);
  const { error: uploadError } = await storage.upload(arquivo.path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: confirmError } = await supabase.rpc(
    'confirmar_arquivo_documento_aluno',
    {
      p_arquivo_id: arquivo.id,
      p_total_paginas: null,
    },
  );
  if (confirmError) throw confirmError;

  return arquivo;
};

export const removeReservasDocumentoAluno = async (
  arquivos: Array<Pick<DocumentoAlunoArquivoReservado, 'bucket' | 'path'>>,
) => {
  const byBucket = new Map<string, string[]>();
  for (const arquivo of arquivos) {
    const bucket = arquivo.bucket || DOCUMENTOS_ALUNO_BUCKET;
    byBucket.set(bucket, [...(byBucket.get(bucket) || []), arquivo.path]);
  }
  const results = await Promise.all(
    [...byBucket.entries()].map(([bucket, paths]) =>
      supabase.storage.from(bucket).remove(paths)),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
};

export const createDocumentoAlunoSignedUrl = async (arquivo: DocumentoAlunoArquivo) => {
  if (!arquivo.bucket || !arquivo.path || arquivo.status === 'excluido') {
    return arquivo;
  }

  const { data, error } = await supabase.storage
    .from(arquivo.bucket)
    .createSignedUrl(arquivo.path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.warn('Não foi possível assinar o documento privado:', error);
    return arquivo;
  }
  return { ...arquivo, url: data?.signedUrl || null };
};

export const hydratePainelDocumentosUrls = async (
  painel: DocumentoAlunoPainel,
): Promise<DocumentoAlunoPainel> => {
  const arquivos = new Map<string, DocumentoAlunoArquivo>();

  for (const item of painel.itens) {
    for (const versao of item.versoes) {
      for (const fonte of versao.fontes) arquivos.set(fonte.arquivo.id, fonte.arquivo);
    }
  }
  for (const lote of painel.lotesPdf) {
    for (const arquivo of lote.arquivos) arquivos.set(arquivo.id, arquivo);
  }

  const signedEntries = await Promise.all(
    [...arquivos.entries()].map(async ([id, arquivo]) => [
      id,
      await createDocumentoAlunoSignedUrl(arquivo),
    ] as const),
  );
  const signed = new Map(signedEntries);
  const withSignedFile = (arquivo: DocumentoAlunoArquivo) =>
    signed.get(arquivo.id) || arquivo;

  return {
    ...painel,
    itens: painel.itens.map((item) => ({
      ...item,
      versaoAtual: item.versaoAtual
        ? {
          ...item.versaoAtual,
          fontes: item.versaoAtual.fontes.map((fonte) => ({
            ...fonte,
            arquivo: withSignedFile(fonte.arquivo),
          })),
        }
        : null,
      versoes: item.versoes.map((versao) => ({
        ...versao,
        fontes: versao.fontes.map((fonte) => ({
          ...fonte,
          arquivo: withSignedFile(fonte.arquivo),
        })),
      })),
    })),
    lotesPdf: painel.lotesPdf.map((lote) => ({
      ...lote,
      arquivos: lote.arquivos.map(withSignedFile),
    })),
  };
};
