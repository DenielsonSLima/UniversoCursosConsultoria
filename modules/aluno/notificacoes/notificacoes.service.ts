import { supabase } from '../../../lib/supabase';
import type {
  AlunoNotification,
  AlunoNotificationCategory,
  AlunoNotificationCursor,
  AlunoNotificationFilter,
  AlunoNotificationPage,
  AlunoRelationshipBirthdayPreference,
} from './notificacoes.types';
import {
  RELATIONSHIP_BIRTHDAY_LEGAL_BASIS,
  RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
} from '../../shared/constants/relationship-consent';

type AlunoNotificationRow = {
  id: string;
  aluno_id: string;
  source_job_id: string | null;
  source_type: string;
  category: AlunoNotificationCategory;
  title: string;
  body: string;
  deep_link: string;
  image_asset_id: string | null;
  image_path: string | null;
  visible_at: string;
  read_at: string | null;
  created_at: string;
};

const PUSH_IMAGE_PATH_PATTERN = /^(?:campaigns|birthday)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png)$/;

const pushImageUrl = (imagePath: string | null) => {
  if (!imagePath || !PUSH_IMAGE_PATH_PATTERN.test(imagePath)) return null;
  return supabase.storage.from('push-notification-images').getPublicUrl(imagePath).data.publicUrl;
};

const mapNotification = (row: AlunoNotificationRow): AlunoNotification => ({
  id: row.id,
  alunoId: row.aluno_id,
  sourceJobId: row.source_job_id,
  sourceType: row.source_type,
  category: row.category,
  title: row.title,
  body: row.body,
  deepLink: row.deep_link,
  imageAssetId: row.image_asset_id,
  imagePath: row.image_path,
  imageUrl: pushImageUrl(row.image_path),
  visibleAt: row.visible_at,
  readAt: row.read_at,
  createdAt: row.created_at,
});

const NOTIFICATION_SELECT = 'id, aluno_id, source_job_id, source_type, category, title, body, deep_link, image_asset_id, image_path, visible_at, read_at, created_at';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAGE_SIZE = 20;

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const mapCursor = (value: unknown): AlunoNotificationCursor | null => {
  const cursor = asRecord(value);
  const snapshotAt = typeof cursor.snapshotAt === 'string' ? cursor.snapshotAt : '';
  const visibleAt = typeof cursor.visibleAt === 'string' ? cursor.visibleAt : '';
  const id = typeof cursor.id === 'string' ? cursor.id : '';
  if (!snapshotAt || !visibleAt || !UUID_PATTERN.test(id)) return null;
  return { snapshotAt, visibleAt, id };
};

export const alunoNotificationKeys = {
  root: (alunoId: string) => ['aluno', alunoId, 'notificacoes'] as const,
  lists: (alunoId: string) =>
    ['aluno', alunoId, 'notificacoes', 'lista'] as const,
  list: (alunoId: string, filter: AlunoNotificationFilter) =>
    ['aluno', alunoId, 'notificacoes', 'lista', { filter, pageSize: PAGE_SIZE }] as const,
  unread: (alunoId: string) =>
    ['aluno', alunoId, 'notificacoes', 'nao-lidas'] as const,
  detail: (alunoId: string, reference: string) =>
    ['aluno', alunoId, 'notificacoes', 'detalhe', reference] as const,
  details: (alunoId: string) =>
    ['aluno', alunoId, 'notificacoes', 'detalhe'] as const,
  relationshipPreference: (alunoId: string) =>
    ['aluno', alunoId, 'notificacoes', 'preferencia-relacionamento-aniversario'] as const,
};

export const alunoNotificationService = {
  async listPage(
    alunoId: string,
    filter: AlunoNotificationFilter,
    cursor: AlunoNotificationCursor | null,
    signal?: AbortSignal,
  ): Promise<AlunoNotificationPage> {
    if (!alunoId) return { items: [], nextCursor: null };
    let query = (supabase.rpc as any)('aluno_notificacoes_listar_pagina', {
      p_filter: filter,
      p_limit: PAGE_SIZE,
      p_snapshot_at: cursor?.snapshotAt || null,
      p_cursor_visible_at: cursor?.visibleAt || null,
      p_cursor_id: cursor?.id || null,
    });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    const payload = asRecord(data);
    const rows = Array.isArray(payload.items) ? payload.items : [];
    return {
      items: (rows as AlunoNotificationRow[]).map(mapNotification),
      nextCursor: mapCursor(payload.nextCursor),
    };
  },

  async detail(
    alunoId: string,
    reference: { notificationId?: string | null; sourceJobId?: string | null },
  ) {
    const notificationId = reference.notificationId?.trim() || null;
    const sourceJobId = reference.sourceJobId?.trim() || null;
    const value = notificationId || sourceJobId;
    if (!value || !UUID_PATTERN.test(value)) return null;

    let query = supabase
      .from('aluno_notificacoes')
      .select(NOTIFICATION_SELECT)
      .eq('aluno_id', alunoId)
      .is('archived_at', null);
    query = notificationId
      ? query.eq('id', notificationId)
      : query.eq('source_job_id', sourceJobId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? mapNotification(data as AlunoNotificationRow) : null;
  },

  async unreadCount(alunoId: string) {
    const { count, error } = await supabase
      .from('aluno_notificacoes')
      .select('id', { count: 'exact', head: true })
      .eq('aluno_id', alunoId)
      .is('read_at', null)
      .is('archived_at', null);
    if (error) throw error;
    return count || 0;
  },

  async markRead(notificationId: string) {
    const { data, error } = await (supabase.rpc as any)('aluno_notificacao_marcar_lida', {
      p_notification_id: notificationId,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async markAllRead() {
    const { data, error } = await (supabase.rpc as any)('aluno_notificacoes_marcar_todas_lidas');
    if (error) throw error;
    return Number(data || 0);
  },

  async archive(notificationId: string) {
    const { data, error } = await (supabase.rpc as any)('aluno_notificacao_arquivar', {
      p_notification_id: notificationId,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async getRelationshipPreference(): Promise<AlunoRelationshipBirthdayPreference> {
    const { data, error } = await (supabase.rpc as any)('aluno_push_relacionamento_preferencia_obter');
    if (error) throw error;
    const row = asRecord(data);
    return {
      configured: row.configured === true || row.decided === true,
      allowed: row.allowed === true,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
      policyVersion: typeof row.policyVersion === 'string' ? row.policyVersion : RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
      legalBasis: RELATIONSHIP_BIRTHDAY_LEGAL_BASIS,
      activationReason: typeof row.activationReason === 'string' ? row.activationReason : null,
      includesCommercialAdvertising: false,
      canOptOut: true,
    };
  },

  async updateRelationshipPreference(allowed: boolean): Promise<AlunoRelationshipBirthdayPreference> {
    const { data, error } = await (supabase.rpc as any)('aluno_push_relacionamento_preferencia_registrar', {
      p_allowed: allowed,
      p_surface: 'student_notification_preferences',
    });
    if (error) throw error;
    const row = asRecord(data);
    return {
      allowed: row.allowed === true,
      configured: row.configured === true || row.decided === true,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
      policyVersion: typeof row.policyVersion === 'string' ? row.policyVersion : RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
      legalBasis: RELATIONSHIP_BIRTHDAY_LEGAL_BASIS,
      activationReason: typeof row.activationReason === 'string' ? row.activationReason : null,
      includesCommercialAdvertising: false,
      canOptOut: true,
    };
  },
};
