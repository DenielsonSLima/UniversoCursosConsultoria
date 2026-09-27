import { supabase } from '../../../../lib/supabase';
import type { CreateDespesaInput, DespesaLancamento } from './despesas.types';

export const DESPESAS_ANEXOS_BUCKET = 'despesas-anexos';
const DESPESAS_ANEXOS_MAX_BYTES = 10 * 1024 * 1024;
const DESPESAS_ANEXOS_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface DespesaAnexoUpload {
  bucket: string;
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
}

export const uploadDespesaAnexo = async (
  input: CreateDespesaInput,
): Promise<DespesaAnexoUpload | undefined> => {
  if (!input.anexo) return undefined;

  const extension = DESPESAS_ANEXOS_EXTENSIONS[input.anexo.type];
  if (!extension) throw new Error('Anexe um arquivo PDF, JPG, PNG ou WEBP.');
  if (input.anexo.size <= 0 || input.anexo.size > DESPESAS_ANEXOS_MAX_BYTES) {
    throw new Error('O anexo deve ter no máximo 10 MB.');
  }

  const path = `${input.poloId}/${input.requestId}/anexo.${extension}`;
  const { error } = await supabase.storage
    .from(DESPESAS_ANEXOS_BUCKET)
    .upload(path, input.anexo, {
      cacheControl: '3600',
      contentType: input.anexo.type,
      upsert: true,
    });
  if (error) throw error;

  return {
    bucket: DESPESAS_ANEXOS_BUCKET,
    path,
    nome: input.anexo.name,
    mime: input.anexo.type,
    tamanho: input.anexo.size,
  };
};

export const cleanupDespesaAnexoIfRequestFailed = async (
  requestId: string,
  uploaded?: DespesaAnexoUpload,
) => {
  if (!uploaded) return;
  const { data, error } = await supabase
    .from('despesas_lancamentos')
    .select('id')
    .eq('request_id', requestId)
    .limit(1);

  if (!error && (!data || data.length === 0)) {
    const { error: cleanupError } = await supabase.storage
      .from(uploaded.bucket)
      .remove([uploaded.path]);
    if (cleanupError) console.error('Não foi possível remover o anexo da despesa não criada:', cleanupError);
  } else if (error) {
    console.warn('O anexo foi preservado porque não foi possível confirmar o lançamento:', error);
  }
};

export const getDespesaAnexoUrl = async (item: DespesaLancamento): Promise<string> => {
  if (!item.anexoPath) throw new Error('Esta despesa não possui anexo.');
  const { data, error } = await supabase.storage
    .from(item.anexoBucket || DESPESAS_ANEXOS_BUCKET)
    .createSignedUrl(item.anexoPath, 300);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Não foi possível abrir o anexo.');
  return data.signedUrl;
};
