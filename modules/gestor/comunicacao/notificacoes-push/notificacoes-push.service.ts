import { supabase } from '../../../../lib/supabase';
import type {
  CreatePushCampaignInput,
  PushCampaign,
  PushCampaignCategory,
  PushCampaignDraft,
  PushCampaignListParams,
  PushCampaignListResult,
  PushCampaignMutationResult,
  PushCampaignPreview,
  PushCampaignStatus,
  PushSegments,
} from './notificacoes-push.types';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O servidor retornou dados inválidos para notificações push.');
  }
  return value as UnknownRecord;
};

const stringValue = (row: UnknownRecord, camel: string, snake: string, fallback = '') => {
  const value = row[camel] ?? row[snake];
  return typeof value === 'string' ? value : fallback;
};

const nullableString = (row: UnknownRecord, camel: string, snake: string) => {
  const value = row[camel] ?? row[snake];
  return typeof value === 'string' && value ? value : null;
};

const numberValue = (row: UnknownRecord, camel: string, snake: string) => {
  const value = Number(row[camel] ?? row[snake] ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const booleanValue = (row: UnknownRecord, key: string) => row[key] === true;

const rpcError = (error: { code?: string; message?: string }) => {
  if (error.code === '42883' || error.message?.includes('Could not find the function')) {
    return new Error('O backend de notificações push ainda não foi publicado. A composição permanece preservada nesta tela.');
  }
  return error;
};

const mapSegments = (value: unknown): PushSegments => {
  const row = asRecord(value);
  const polos = Array.isArray(row.polos) ? row.polos : [];
  const turmas = Array.isArray(row.turmas) ? row.turmas : [];
  return {
    polos: polos.map((item) => {
      const segment = asRecord(item);
      return {
        id: stringValue(segment, 'id', 'id'),
        nome: stringValue(segment, 'nome', 'nome'),
        eligibleUsers: numberValue(segment, 'eligibleUsers', 'eligible_users'),
        eligibleDevices: numberValue(segment, 'eligibleDevices', 'eligible_devices'),
      };
    }),
    turmas: turmas.map((item) => {
      const segment = asRecord(item);
      return {
        id: stringValue(segment, 'id', 'id'),
        nome: stringValue(segment, 'nome', 'nome'),
        poloId: nullableString(segment, 'poloId', 'polo_id'),
        poloNome: nullableString(segment, 'poloNome', 'polo_nome'),
        eligibleUsers: numberValue(segment, 'eligibleUsers', 'eligible_users'),
        eligibleDevices: numberValue(segment, 'eligibleDevices', 'eligible_devices'),
      };
    }),
  };
};

const mapPreview = (value: unknown): PushCampaignPreview => {
  const row = asRecord(value);
  const warnings = row.warnings;
  return {
    eligibleUsers: numberValue(row, 'eligibleUsers', 'eligible_users'),
    eligibleDevices: numberValue(row, 'eligibleDevices', 'eligible_devices'),
    androidDevices: numberValue(row, 'androidDevices', 'android_devices'),
    iosDevices: numberValue(row, 'iosDevices', 'ios_devices'),
    audienceLabel: stringValue(row, 'audienceLabel', 'audience_label', 'Público selecionado'),
    blockedReason: nullableString(row, 'blockedReason', 'blocked_reason'),
    warnings: Array.isArray(warnings) ? warnings.filter((item): item is string => typeof item === 'string') : [],
    validationToken: stringValue(row, 'validationToken', 'validation_token'),
  };
};

const mapCampaign = (value: unknown): PushCampaign => {
  const row = asRecord(value);
  return {
    id: stringValue(row, 'id', 'id'),
    title: stringValue(row, 'title', 'title'),
    body: stringValue(row, 'body', 'body'),
    category: stringValue(row, 'category', 'category', 'institutional') as PushCampaignCategory,
    audienceType: stringValue(row, 'audienceType', 'audience_type', 'all') as PushCampaign['audienceType'],
    poloId: nullableString(row, 'poloId', 'polo_id'),
    poloName: nullableString(row, 'poloName', 'polo_name'),
    turmaId: nullableString(row, 'turmaId', 'turma_id'),
    turmaName: nullableString(row, 'turmaName', 'turma_name'),
    audienceLabel: stringValue(row, 'audienceLabel', 'audience_label', 'Todos os dispositivos'),
    eligibleUsers: numberValue(row, 'eligibleUsers', 'eligible_users'),
    eligibleDevices: numberValue(row, 'eligibleDevices', 'eligible_devices'),
    status: stringValue(row, 'status', 'status', 'draft') as PushCampaignStatus,
    scheduledAt: nullableString(row, 'scheduledAt', 'scheduled_at'),
    createdAt: stringValue(row, 'createdAt', 'created_at'),
    queuedAt: nullableString(row, 'queuedAt', 'queued_at'),
    completedAt: nullableString(row, 'completedAt', 'completed_at'),
    sentCount: numberValue(row, 'sentCount', 'sent_count'),
    failedCount: numberValue(row, 'failedCount', 'failed_count'),
    skippedCount: numberValue(row, 'skippedCount', 'skipped_count'),
    createdByName: nullableString(row, 'createdByName', 'created_by_name'),
    totalCount: numberValue(row, 'totalCount', 'total_count'),
  };
};

const mapMutationResult = (value: unknown): PushCampaignMutationResult => {
  const row = asRecord(value);
  return {
    id: stringValue(row, 'id', 'id'),
    status: stringValue(row, 'status', 'status', 'draft') as PushCampaignStatus,
    requestId: stringValue(row, 'requestId', 'request_id'),
    replayed: booleanValue(row, 'replayed'),
  };
};

const draftRpcParams = (draft: PushCampaignDraft) => ({
  p_title: draft.title.trim(),
  p_body: draft.body.trim(),
  p_category: draft.category,
  p_deep_link: draft.deepLink,
  p_audience_type: draft.audienceType,
  p_polo_id: draft.audienceType === 'polo' ? draft.poloId : null,
  p_turma_id: draft.audienceType === 'turma' ? draft.turmaId : null,
  p_scheduled_at: draft.scheduledAt,
});

export const pushNotificationKeys = {
  all: ['comunicacao', 'notificacoes-push'] as const,
  segments: ['comunicacao', 'notificacoes-push', 'segmentos'] as const,
  campaigns: (params: PushCampaignListParams) => ['comunicacao', 'notificacoes-push', 'campanhas', params] as const,
};

export const pushNotificationService = {
  async listSegments(): Promise<PushSegments> {
    const { data, error } = await (supabase.rpc as any)('comunicacao_push_segmentos_listar', { p_search: null });
    if (error) throw rpcError(error);
    return mapSegments(data);
  },

  async listCampaigns(params: PushCampaignListParams): Promise<PushCampaignListResult> {
    const { data, error } = await (supabase.rpc as any)('comunicacao_push_campanhas_listar', {
      p_status: params.status === 'all' ? null : params.status,
      p_search: params.search || null,
      p_limit: params.pageSize,
      p_offset: (params.page - 1) * params.pageSize,
    });
    if (error) throw rpcError(error);
    if (!Array.isArray(data)) throw new Error('O histórico de notificações retornou um formato inválido.');
    const rows = data.map(mapCampaign);
    return { rows, total: rows[0]?.totalCount || 0 };
  },

  async previewCampaign(draft: PushCampaignDraft): Promise<PushCampaignPreview> {
    const { data, error } = await (supabase.rpc as any)('comunicacao_push_campanha_previsualizar', draftRpcParams(draft));
    if (error) throw rpcError(error);
    return mapPreview(data);
  },

  async createCampaign(input: CreatePushCampaignInput): Promise<PushCampaignMutationResult> {
    const { data, error } = await (supabase.rpc as any)('comunicacao_push_campanha_criar', {
      ...draftRpcParams(input),
      p_preview_token: input.previewToken,
      p_request_id: input.requestId,
    });
    if (error) throw rpcError(error);
    return mapMutationResult(data);
  },

  async enqueueCampaign(campaignId: string, requestId: string): Promise<PushCampaignMutationResult> {
    const { data, error } = await (supabase.rpc as any)('comunicacao_push_campanha_enfileirar', {
      p_campaign_id: campaignId,
      p_request_id: requestId,
    });
    if (error) throw rpcError(error);
    return mapMutationResult(data);
  },
};
