import { supabase } from '../../../../../../lib/supabase';
import {
  normalizePixKey,
  PIX_KEY_OPTIONS,
  validatePixKey,
  type PixKeyType,
} from '../../formularioparceiros/professor/professor-form.model';

export interface ProfessorPixInput {
  tipoChavePix: PixKeyType;
  chavePix: string;
}

export interface ProfessorPixData extends ProfessorPixInput {
  id: string;
}

const columns = 'id,tipo,chave_pix,tipo_chave_pix';
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const knownTypes = new Set<string>(PIX_KEY_OPTIONS.map(option => option.value));

const readProfessorPix = (row: any, professorId: string): ProfessorPixData => {
  if (!row || row.id !== professorId || row.tipo !== 'Professor'
    || (row.chave_pix !== null && typeof row.chave_pix !== 'string')
    || (row.tipo_chave_pix !== null && !knownTypes.has(row.tipo_chave_pix))) {
    throw new Error('Os dados Pix retornados não correspondem ao professor selecionado.');
  }
  return { id: row.id, tipoChavePix: row.tipo_chave_pix || '', chavePix: row.chave_pix || '' };
};

/** Uses the existing partner UPDATE RLS, without profile, e-mail or Auth mutations. */
export async function saveProfessorPix(
  professorId: string,
  input: ProfessorPixInput,
  client = supabase,
): Promise<ProfessorPixData> {
  if (!uuidPattern.test(professorId)) throw new Error('Professor não identificado.');
  if (!input || typeof input.chavePix !== 'string'
    || (input.tipoChavePix !== '' && !knownTypes.has(input.tipoChavePix))) {
    throw new Error('Informe um tipo e uma chave Pix válidos.');
  }

  const key = input.chavePix.trim();
  if (!input.tipoChavePix && key) {
    const { data, error } = await client.from('parceiros').select(columns)
      .eq('id', professorId).eq('tipo', 'Professor').single();
    if (error) throw error;
    const current = readProfessorPix(data, professorId);
    if (!current.tipoChavePix && current.chavePix === input.chavePix) return current;
    throw new Error('Selecione o tipo da chave Pix para alterar a chave.');
  }

  const validationError = validatePixKey(input.tipoChavePix, key);
  if (validationError) throw new Error(validationError);
  const payload = {
    tipo_chave_pix: input.tipoChavePix || null,
    chave_pix: key ? normalizePixKey(input.tipoChavePix, key) : null,
  };
  const { data, error } = await client.from('parceiros').update(payload)
    .eq('id', professorId).eq('tipo', 'Professor').select(columns).single();
  if (error) throw error;
  const saved = readProfessorPix(data, professorId);
  if (saved.tipoChavePix !== (payload.tipo_chave_pix || '')
    || saved.chavePix !== (payload.chave_pix || '')) {
    throw new Error('A gravação dos dados Pix não foi confirmada.');
  }
  return saved;
}
