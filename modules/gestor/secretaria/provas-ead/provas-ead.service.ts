import { supabase } from '../../../../lib/supabase';

export interface EadExamWait {
  matriculaId: string;
  alunoNome: string;
  cursoNome: string;
  turmaNome: string;
  iniciadoEm: string;
  liberaEm: string;
}

interface EadExamWaitPage {
  items: EadExamWait[];
  total: number;
  page: number;
  pageSize: number;
}

interface EarlyEadExamRelease {
  matriculaId: string;
  liberadoEm: string;
}

const validDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const validWait = (row: unknown): row is EadExamWait => {
  if (!row || typeof row !== 'object') return false;
  const item = row as Partial<EadExamWait>;
  return [item.matriculaId, item.alunoNome, item.cursoNome, item.turmaNome]
    .every(value => typeof value === 'string')
    && validDate(item.iniciadoEm)
    && validDate(item.liberaEm);
};

export async function listEadExamsInWait(
  poloId: string,
  search: string,
  page: number,
  signal: AbortSignal,
): Promise<EadExamWaitPage> {
  const { data, error } = await supabase.rpc('secretaria_listar_provas_ead_em_carencia', {
    p_polo_id: poloId,
    p_busca: search,
    p_pagina: page,
  }).abortSignal(signal);
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || !data.items.every(validWait)
    || !Number.isSafeInteger(data.total) || data.total < 0
    || !Number.isSafeInteger(data.page) || data.page < 1
    || !Number.isSafeInteger(data.pageSize) || data.pageSize < 1) {
    throw new Error('O servidor retornou uma lista de provas incompleta.');
  }
  return data;
}

export async function releaseEadExamEarly(
  poloId: string,
  matriculaId: string,
  reason: string,
): Promise<EarlyEadExamRelease> {
  const { data, error } = await supabase.rpc('secretaria_liberar_prova_ead_antecipada', {
    p_polo_id: poloId,
    p_matricula_id: matriculaId,
    p_motivo: reason,
  });
  if (error) throw error;
  if (data?.matriculaId !== matriculaId || !validDate(data.liberadoEm)) {
    throw new Error('O servidor não confirmou a liberação da prova.');
  }
  return data;
}
