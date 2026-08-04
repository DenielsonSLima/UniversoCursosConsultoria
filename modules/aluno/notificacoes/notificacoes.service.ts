import { supabase } from '../../../lib/supabase';
import type {
  AlunoNotification,
  AlunoNotificationCategory,
  AlunoNotificationFilter,
} from './notificacoes.types';

type AlunoNotificationRow = {
  id: string;
  aluno_id: string;
  source_type: string;
  category: AlunoNotificationCategory;
  title: string;
  body: string;
  deep_link: string;
  visible_at: string;
  read_at: string | null;
  created_at: string;
};

const mapNotification = (row: AlunoNotificationRow): AlunoNotification => ({
  id: row.id,
  alunoId: row.aluno_id,
  sourceType: row.source_type,
  category: row.category,
  title: row.title,
  body: row.body,
  deepLink: row.deep_link,
  visibleAt: row.visible_at,
  readAt: row.read_at,
  createdAt: row.created_at,
});

const applyFilter = (query: any, filter: AlunoNotificationFilter) => {
  if (filter === 'unread') return query.is('read_at', null);
  if (filter === 'financial') return query.eq('category', 'financial');
  if (filter === 'academic') return query.in('category', ['academic', 'calendar']);
  if (filter === 'institutional') {
    return query.in('category', ['institutional', 'service', 'marketing']);
  }
  return query;
};

export const alunoNotificationKeys = {
  root: (alunoId: string) => ['aluno', alunoId, 'notificacoes'] as const,
  list: (alunoId: string, filter: AlunoNotificationFilter) =>
    ['aluno', alunoId, 'notificacoes', 'lista', filter] as const,
  unread: (alunoId: string) =>
    ['aluno', alunoId, 'notificacoes', 'nao-lidas'] as const,
};

export const alunoNotificationService = {
  async list(alunoId: string, filter: AlunoNotificationFilter) {
    const now = new Date().toISOString();
    let query = supabase
      .from('aluno_notificacoes')
      .select('id, aluno_id, source_type, category, title, body, deep_link, visible_at, read_at, created_at')
      .eq('aluno_id', alunoId)
      .is('archived_at', null)
      .lte('visible_at', now)
      .order('visible_at', { ascending: false })
      .limit(100);

    query = applyFilter(query, filter);
    const { data, error } = await query;
    if (error) throw error;
    return ((data || []) as AlunoNotificationRow[]).map(mapNotification);
  },

  async unreadCount(alunoId: string) {
    const { count, error } = await supabase
      .from('aluno_notificacoes')
      .select('id', { count: 'exact', head: true })
      .eq('aluno_id', alunoId)
      .is('read_at', null)
      .is('archived_at', null)
      .lte('visible_at', new Date().toISOString());
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
};
