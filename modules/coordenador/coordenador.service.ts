import { supabase } from '../../lib/supabase';
import type { CoordenadorAtribuicao } from './coordenador.contract';

type RpcRecord = Record<string, unknown>;

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`O campo ${field} não foi devolvido pelo serviço autorizado.`);
  }
  return value.trim();
};

const nullableString = (value: unknown, field: string) => {
  if (value === null || value === undefined || value === '') return null;
  return requiredString(value, field);
};

const normalizeAtribuicao = (value: unknown): CoordenadorAtribuicao => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A atribuição de coordenação devolvida pelo serviço é inválida.');
  }
  const source = value as RpcRecord;
  return {
    coordenacaoId: requiredString(source.coordenacaoId, 'coordenacaoId'),
    cursoId: requiredString(source.cursoId, 'cursoId'),
    cursoNome: requiredString(source.cursoNome, 'cursoNome'),
    poloId: requiredString(source.poloId, 'poloId'),
    poloNome: requiredString(source.poloNome, 'poloNome'),
    vigenteDe: nullableString(source.vigenteDe, 'vigenteDe'),
    vigenteAte: nullableString(source.vigenteAte, 'vigenteAte'),
  };
};

/** O professorId vem exclusivamente do `contextId` do contexto Coordenador. */
export const listarAtribuicoesCoordenador = async (
  professorId: string,
  activePoloId: string,
): Promise<readonly CoordenadorAtribuicao[]> => {
  const { data, error } = await supabase.rpc('coordenador_listar_atribuicoes', {
    p_professor_id: requiredString(professorId, 'professorId'),
    p_polo_id: requiredString(activePoloId, 'activePoloId'),
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) {
    throw new Error('O serviço de coordenações não devolveu uma lista válida.');
  }
  return data.map(normalizeAtribuicao);
};
