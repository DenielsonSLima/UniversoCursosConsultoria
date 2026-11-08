import type { DespesaLancamento } from './despesas.types.ts';

interface FornecedorFantasia {
  id: string;
  nome_fantasia?: string | null;
}

type FornecedorLookup = (ids: string[]) => PromiseLike<{
  data: FornecedorFantasia[] | null;
  error: unknown;
}>;

/** Complementa somente fornecedores presentes na resposta autorizada da despesa. */
export const enrichDespesasFornecedorFantasia = async <T extends { fornecedor_id?: string | null }>(
  rows: T[],
  lookup: FornecedorLookup,
): Promise<T[]> => {
  const ids = Array.from(new Set(rows.map((row) => row.fornecedor_id).filter(Boolean))) as string[];
  if (ids.length === 0) return rows;
  try {
    const { data, error } = await lookup(ids);
    if (error || !Array.isArray(data)) return rows;
    const fornecedores = new Map(data.map((row) => [row.id, row.nome_fantasia]));
    return rows.map((row) => fornecedores.has(row.fornecedor_id || '') ? {
      ...row,
      fornecedor_nome_fantasia: fornecedores.get(row.fornecedor_id || '') || null,
    } : row);
  } catch {
    // Falha de metadado mantém a razão social já retornada pelo contrato financeiro.
    return rows;
  }
};

export const getDespesaFornecedorRotulo = (
  item: Pick<DespesaLancamento, 'fornecedorNomeFantasia' | 'fornecedorNome'>,
) => item.fornecedorNomeFantasia?.trim() || item.fornecedorNome || 'Fornecedor não informado';
