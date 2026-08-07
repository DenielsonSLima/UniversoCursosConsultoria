import { supabase } from '../../../lib/supabase';
import type {
  CreatePatrimonioInput,
  PatrimonioItem,
  PatrimonioListFilters,
  PatrimonioListResult,
} from './patrimonio.types';

type RpcRecord = Record<string, unknown>;

interface PatrimonioListRpcResponse {
  items?: unknown[];
  total?: number | string | null;
  limit?: number | string | null;
  offset?: number | string | null;
}

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

const mapPatrimonio = (value: unknown): PatrimonioItem => {
  const row = asRecord(value);
  const polo = asRecord(row.polos);

  return {
    id: asText(row.id),
    poloId: asText(row.polo_id),
    poloNome: asOptionalText(row.polo_nome) || asOptionalText(polo.nome),
    dataAquisicao: asText(row.data_aquisicao),
    tipoProduto: asText(row.tipo_produto),
    descricao: asText(row.descricao),
    quantidade: asNumber(row.quantidade),
    valorUnitario: asNumber(row.valor_unitario),
    valorTotal: asNumber(row.valor_total),
    numeroSerie: asOptionalText(row.numero_serie),
    observacao: asOptionalText(row.observacao),
    createdAt: asOptionalText(row.created_at),
    updatedAt: asOptionalText(row.updated_at),
  };
};

export const createPatrimonioRequestId = () => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    })
);

export const patrimonioService = {
  async list(filters: PatrimonioListFilters): Promise<PatrimonioListResult> {
    if (!filters.poloId) {
      return {
        items: [],
        total: 0,
        limit: filters.limit,
        offset: filters.offset,
      };
    }

    const { data, error } = await supabase.rpc('listar_patrimonios_secure', {
      p_polo_id: filters.poloId,
      p_search: filters.search?.trim() || null,
      p_tipo_produto: filters.tipoProduto?.trim() || null,
      p_limit: filters.limit,
      p_offset: filters.offset,
    });

    if (error) throw error;

    const payload = asRecord(Array.isArray(data) ? data[0] : data) as PatrimonioListRpcResponse;
    const items = Array.isArray(payload.items) ? payload.items.map(mapPatrimonio) : [];

    return {
      items,
      total: asNumber(payload.total),
      limit: asNumber(payload.limit) || filters.limit,
      offset: asNumber(payload.offset),
    };
  },

  async create(input: CreatePatrimonioInput): Promise<PatrimonioItem> {
    const { data, error } = await supabase.rpc('criar_patrimonio_secure', {
      p_request_id: input.requestId,
      p_polo_id: input.poloId,
      p_data_aquisicao: input.dataAquisicao,
      p_tipo_produto: input.tipoProduto,
      p_descricao: input.descricao,
      p_quantidade: input.quantidade,
      p_valor_unitario: input.valorUnitario,
      p_numero_serie: input.numeroSerie?.trim() || null,
      p_observacao: input.observacao?.trim() || null,
    });

    if (error) throw error;
    return mapPatrimonio(Array.isArray(data) ? data[0] : data);
  },
};
