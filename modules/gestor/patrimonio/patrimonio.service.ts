import { supabase } from '../../../lib/supabase';
import type {
  CreatePatrimonioInput,
  PatrimonioItem,
  PatrimonioListFilters,
  PatrimonioListResult,
  RemovePatrimonioInput,
  UpdatePatrimonioInput,
  WriteOffPatrimonioInput,
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

const asDecimalText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '0';
};

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asBoolean = (value: unknown) => value === true;

const mapPatrimonio = (value: unknown): PatrimonioItem => {
  const row = asRecord(value);
  const polo = asRecord(row.polos);
  const status = row.status === 'baixado' || row.status === 'excluido' ? row.status : 'ativo';
  const quantidadeOriginal = asNumber(row.quantidade_original ?? row.quantidade);
  const quantidadeBaixada = asNumber(row.quantidade_baixada);
  const quantidadeDisponivel = asNumber(row.quantidade_disponivel ?? row.quantidade);

  return {
    id: asText(row.id),
    poloId: asText(row.polo_id),
    poloNome: asOptionalText(row.polo_nome) || asOptionalText(polo.nome),
    dataAquisicao: asText(row.data_aquisicao),
    tipoProdutoId: asOptionalText(row.tipo_produto_id),
    tipoProduto: asText(row.tipo_produto),
    descricao: asText(row.descricao),
    status,
    quantidadeOriginal,
    quantidadeBaixada,
    quantidadeDisponivel,
    valorUnitario: asDecimalText(row.valor_unitario),
    valorTotalOriginal: asDecimalText(row.valor_total_original ?? row.valor_total),
    valorDisponivel: asDecimalText(
      row.valor_disponivel
      ?? row.valor_total_disponivel
      ?? row.valor_patrimonial_ativo
      ?? row.valor_total,
    ),
    numeroSerie: asOptionalText(row.numero_serie),
    observacao: asOptionalText(row.observacao),
    dataUltimaBaixa: asOptionalText(row.ultima_baixa_em ?? row.data_ultima_baixa),
    motivoUltimaBaixa: asOptionalText(row.ultima_baixa_motivo ?? row.motivo_ultima_baixa),
    deletedAt: asOptionalText(row.excluido_at ?? row.deleted_at),
    canEdit: row.can_edit === undefined ? status !== 'excluido' : asBoolean(row.can_edit),
    canEditEconomicFields: row.can_edit_economic_fields === undefined
      ? status !== 'excluido' && quantidadeBaixada === 0
      : asBoolean(row.can_edit_economic_fields),
    canWriteOff: row.can_write_off === undefined
      ? status === 'ativo' && quantidadeDisponivel > 0
      : asBoolean(row.can_write_off),
    canDelete: asBoolean(row.can_delete),
    createdAt: asOptionalText(row.created_at),
    updatedAt: asText(row.updated_at),
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

    const { data, error } = await supabase.rpc('listar_patrimonios_v2_secure', {
      p_polo_id: filters.poloId,
      p_search: filters.search?.trim() || null,
      p_tipo_produto_id: filters.tipoProduto?.trim() || null,
      p_status: filters.status,
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
    const { data, error } = await supabase.rpc('criar_patrimonio_v2_secure', {
      p_request_id: input.requestId,
      p_polo_id: input.poloId,
      p_data_aquisicao: input.dataAquisicao,
      p_tipo_produto_id: input.tipoProdutoId,
      p_descricao: input.descricao,
      p_quantidade: input.quantidade,
      p_valor_unitario: input.valorUnitario,
      p_numero_serie: input.numeroSerie?.trim() || null,
      p_observacao: input.observacao?.trim() || null,
    });

    if (error) throw error;
    return mapPatrimonio(Array.isArray(data) ? data[0] : data);
  },

  async update(input: UpdatePatrimonioInput): Promise<PatrimonioItem> {
    const { data, error } = await supabase.rpc('atualizar_patrimonio_secure', {
      p_request_id: input.requestId,
      p_polo_id: input.poloId,
      p_patrimonio_id: input.patrimonioId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_data_aquisicao: input.dataAquisicao,
      p_tipo_produto_id: input.tipoProdutoId,
      p_descricao: input.descricao,
      p_quantidade: input.quantidade,
      p_valor_unitario: input.valorUnitario,
      p_numero_serie: input.numeroSerie?.trim() || null,
      p_observacao: input.observacao?.trim() || null,
      p_motivo: input.motivo.trim(),
    });

    if (error) throw error;
    return mapPatrimonio(Array.isArray(data) ? data[0] : data);
  },

  async writeOff(input: WriteOffPatrimonioInput): Promise<PatrimonioItem> {
    const { data, error } = await supabase.rpc('baixar_patrimonio_perda_secure', {
      p_request_id: input.requestId,
      p_polo_id: input.poloId,
      p_patrimonio_id: input.patrimonioId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_data_baixa: input.dataBaixa,
      p_quantidade_baixa: input.quantidadeBaixa,
      p_motivo: input.motivo,
      p_observacao: input.observacao?.trim() || null,
    });

    if (error) throw error;
    return mapPatrimonio(Array.isArray(data) ? data[0] : data);
  },

  async remove(input: RemovePatrimonioInput): Promise<PatrimonioItem> {
    const { data, error } = await supabase.rpc('excluir_patrimonio_secure', {
      p_request_id: input.requestId,
      p_polo_id: input.poloId,
      p_patrimonio_id: input.patrimonioId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_motivo: input.motivo.trim(),
    });

    if (error) throw error;
    return mapPatrimonio(Array.isArray(data) ? data[0] : data);
  },
};
