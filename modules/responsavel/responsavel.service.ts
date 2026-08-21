import { supabase } from '../../lib/supabase';
import type {
  ResponsavelDependente,
  ResponsavelParentesco,
} from './responsavel.contract';

type RpcRecord = Record<string, unknown>;

const RELATIONSHIPS = new Set<ResponsavelParentesco>([
  'MAE',
  'PAI',
  'TUTOR',
  'GUARDIAO_JUDICIAL',
  'OUTRO',
]);

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`O campo ${field} não foi devolvido pelo serviço autorizado.`);
  }
  return value.trim();
};

const stringArray = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`O campo ${field} não corresponde ao contrato autorizado.`);
  }
  return [...new Set(value.map((item) => item.trim()))];
};

const normalizeDependente = (value: unknown): ResponsavelDependente => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O vínculo de dependente devolvido pelo serviço é inválido.');
  }
  const source = value as RpcRecord;
  const parentesco = requiredString(source.parentesco, 'parentesco') as ResponsavelParentesco;
  if (!RELATIONSHIPS.has(parentesco)) {
    throw new Error('O parentesco devolvido pelo serviço não foi reconhecido.');
  }
  return {
    vinculoId: requiredString(source.vinculoId, 'vinculoId'),
    alunoId: requiredString(source.alunoId, 'alunoId'),
    nome: requiredString(source.nome, 'nome'),
    parentesco,
    poloIds: stringArray(source.poloIds, 'poloIds'),
    vigenteDe: requiredString(source.vigenteDe, 'vigenteDe'),
    vigenteAte: source.vigenteAte === null ? null : requiredString(source.vigenteAte, 'vigenteAte'),
  };
};

/** O identificador vem do contexto Responsável emitido pela RPC de perfis. */
export const listarDependentesResponsavel = async (
  responsavelLegalId: string,
): Promise<readonly ResponsavelDependente[]> => {
  const { data, error } = await supabase.rpc('responsavel_legal_listar_dependentes', {
    p_responsavel_legal_id: responsavelLegalId,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) {
    throw new Error('O serviço de dependentes não devolveu uma lista válida.');
  }
  return data.map(normalizeDependente);
};
