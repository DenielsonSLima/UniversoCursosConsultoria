import { supabase } from '../../../lib/supabase';

export type PatrimonioProductTypeStatus = 'ativo' | 'inativo';

export interface PatrimonioProductType {
  id: string;
  companyId: string;
  nome: string;
  descricao?: string;
  status: PatrimonioProductTypeStatus;
  usageCount: number;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePatrimonioProductTypeInput {
  requestId: string;
  poloId: string;
  nome: string;
  descricao?: string;
}

export interface UpdatePatrimonioProductTypeInput {
  id: string;
  poloId: string;
  nome: string;
  descricao?: string;
  status: PatrimonioProductTypeStatus;
  expectedUpdatedAt: string;
}

export interface RemovePatrimonioProductTypeInput {
  id: string;
  poloId: string;
  expectedUpdatedAt: string;
}

type RpcRecord = Record<string, unknown>;

const asRecord = (value: unknown): RpcRecord => (
  value !== null && typeof value === 'object' ? value as RpcRecord : {}
);

const asText = (value: unknown) => typeof value === 'string' ? value : '';
const asOptionalText = (value: unknown) => {
  const text = asText(value).trim();
  return text || undefined;
};
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const unwrapSingle = (value: unknown) => {
  if (Array.isArray(value)) return value[0];
  const payload = asRecord(value);
  return payload.item ?? payload.tipo ?? payload;
};

const mapProductType = (value: unknown): PatrimonioProductType => {
  const row = asRecord(value);
  return {
    id: asText(row.id),
    companyId: asText(row.company_id),
    nome: asText(row.nome),
    descricao: asOptionalText(row.descricao),
    status: row.status === 'inativo' ? 'inativo' : 'ativo',
    usageCount: asNumber(row.usage_count),
    canDelete: row.can_delete === true,
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  };
};

const unwrapList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const payload = asRecord(value);
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.tipos)) return payload.tipos;
  return [];
};

export const patrimonioProductTypeQueryKeys = {
  root: ['patrimonio', 'product-types'] as const,
  list: (poloId: string | null, includeInactive: boolean) => (
    ['patrimonio', 'product-types', 'list', poloId, { includeInactive }] as const
  ),
};

export const patrimonioProductTypesService = {
  async list(poloId: string, includeInactive: boolean): Promise<PatrimonioProductType[]> {
    const { data, error } = await supabase.rpc('listar_patrimonio_tipos_produto_secure', {
      p_polo_id: poloId,
      p_incluir_inativos: includeInactive,
    });

    if (error) throw new Error(error.message);
    return unwrapList(data).map(mapProductType);
  },

  async create(input: CreatePatrimonioProductTypeInput): Promise<PatrimonioProductType> {
    const { data, error } = await supabase.rpc('criar_patrimonio_tipo_produto_secure', {
      p_request_id: input.requestId,
      p_polo_matriz_id: input.poloId,
      p_nome: input.nome.trim(),
      p_descricao: input.descricao?.trim() || null,
    });

    if (error) throw new Error(error.message);
    return mapProductType(unwrapSingle(data));
  },

  async update(input: UpdatePatrimonioProductTypeInput): Promise<PatrimonioProductType> {
    const { data, error } = await supabase.rpc('atualizar_patrimonio_tipo_produto_secure', {
      p_tipo_id: input.id,
      p_polo_matriz_id: input.poloId,
      p_nome: input.nome.trim(),
      p_descricao: input.descricao?.trim() || null,
      p_status: input.status,
      p_expected_updated_at: input.expectedUpdatedAt,
    });

    if (error) throw new Error(error.message);
    return mapProductType(unwrapSingle(data));
  },

  async remove(input: RemovePatrimonioProductTypeInput): Promise<PatrimonioProductType> {
    const { data, error } = await supabase.rpc('excluir_patrimonio_tipo_produto_secure', {
      p_tipo_id: input.id,
      p_polo_matriz_id: input.poloId,
      p_expected_updated_at: input.expectedUpdatedAt,
    });

    if (error) throw new Error(error.message);
    return mapProductType(unwrapSingle(data));
  },
};
