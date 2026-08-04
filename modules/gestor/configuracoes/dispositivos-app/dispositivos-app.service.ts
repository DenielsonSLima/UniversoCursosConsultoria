import { supabase } from '../../../../lib/supabase';
import type {
  AppDevicePolo,
  AppDeviceAuditEvent,
  AppDeviceStudentDetail,
  AppDevicesSummary,
  AppDeviceStatusFilter,
  AppDeviceUser,
} from './dispositivos-app.types';

type AppDeviceUserRow = {
  aluno_id: string;
  nome: string;
  matricula: string | null;
  email: string | null;
  polo_id: string | null;
  polo_nome: string | null;
  app_installed: boolean;
  session_active: boolean;
  online_now: boolean;
  notification_active: boolean;
  plataformas: Array<'android' | 'ios'> | null;
  device_count: number | string;
  permission_status: AppDeviceUser['permissionStatus'];
  installed_at: string | null;
  last_seen_at: string | null;
  app_version: string | null;
  total_count: number | string;
};

export interface ListAppDeviceUsersParams {
  poloId: string | null;
  search: string;
  status: AppDeviceStatusFilter;
  page: number;
  pageSize: number;
}

export const dispositivosAppKeys = {
  all: ['configuracoes', 'dispositivos-app'] as const,
  polos: ['configuracoes', 'dispositivos-app', 'polos'] as const,
  summary: (poloId: string | null) => [...dispositivosAppKeys.all, 'summary', poloId || 'all'] as const,
  list: (params: ListAppDeviceUsersParams) => [...dispositivosAppKeys.all, 'list', params] as const,
  detail: (alunoId: string) => [...dispositivosAppKeys.all, 'detail', alunoId] as const,
  events: (alunoId: string) => [...dispositivosAppKeys.all, 'events', alunoId] as const,
};

export const dispositivosAppService = {
  async listPolos(): Promise<AppDevicePolo[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, cidade, estado')
      .order('nome');
    if (error) throw error;
    return (data || []) as AppDevicePolo[];
  },

  async getSummary(poloId: string | null): Promise<AppDevicesSummary> {
    const { data, error } = await (supabase.rpc as any)('get_aluno_app_devices_summary', {
      p_polo_id: poloId,
    });
    if (error) throw error;
    const row = (data as Array<Record<string, number | string>> | null)?.[0];
    return {
      totalAlunos: Number(row?.total_alunos || 0),
      appInstalado: Number(row?.app_instalado || 0),
      onlineAgora: Number(row?.online_agora || 0),
      notificacoesAtivas: Number(row?.notificacoes_ativas || 0),
    };
  },

  async listUsers(params: ListAppDeviceUsersParams): Promise<{ rows: AppDeviceUser[]; total: number }> {
    const [{ data, error }, polos] = await Promise.all([
      (supabase.rpc as any)('list_aluno_app_users', {
        p_polo_id: params.poloId,
        p_search: params.search || null,
        p_status: params.status,
        p_limit: params.pageSize,
        p_offset: (params.page - 1) * params.pageSize,
      }),
      dispositivosAppService.listPolos(),
    ]);
    if (error) throw error;
    const polosById = new Map(polos.map((polo) => [polo.id, polo]));
    const rows = ((data || []) as AppDeviceUserRow[]).map((row) => ({
      alunoId: row.aluno_id,
      nome: row.nome,
      matricula: row.matricula,
      email: row.email,
      poloId: row.polo_id,
      poloNome: row.polo_nome,
      poloCidade: row.polo_id ? polosById.get(row.polo_id)?.cidade || null : null,
      poloUf: row.polo_id ? polosById.get(row.polo_id)?.estado || null : null,
      appInstalled: row.app_installed,
      sessionActive: row.session_active,
      onlineNow: row.online_now,
      notificationActive: row.notification_active,
      plataformas: row.plataformas || [],
      deviceCount: Number(row.device_count || 0),
      permissionStatus: row.permission_status,
      installedAt: row.installed_at,
      lastSeenAt: row.last_seen_at,
      appVersion: row.app_version,
      totalCount: Number(row.total_count || 0),
    }));
    return { rows, total: rows[0]?.totalCount || 0 };
  },

  async getStudentDetail(alunoId: string): Promise<AppDeviceStudentDetail> {
    const [{ data, error }, polos] = await Promise.all([
      (supabase.rpc as any)('get_aluno_app_user_detail', { p_aluno_id: alunoId }),
      dispositivosAppService.listPolos(),
    ]);
    if (error) throw error;
    const row = (data as Array<{
      aluno_id: string;
      nome: string;
      matricula: string | null;
      email: string | null;
      polo_id: string | null;
      polo_nome: string | null;
      dispositivos: AppDeviceStudentDetail['dispositivos'];
    }> | null)?.[0];
    if (!row) throw new Error('Aluno não encontrado.');
    const polo = row.polo_id ? polos.find((item) => item.id === row.polo_id) : null;
    return {
      alunoId: row.aluno_id,
      nome: row.nome,
      matricula: row.matricula,
      email: row.email,
      poloId: row.polo_id,
      poloNome: row.polo_nome,
      poloCidade: polo?.cidade || null,
      poloUf: polo?.estado || null,
      dispositivos: row.dispositivos || [],
    };
  },

  async listStudentEvents(alunoId: string): Promise<AppDeviceAuditEvent[]> {
    const { data, error } = await (supabase.rpc as any)('list_aluno_app_device_events', {
      p_aluno_id: alunoId,
      p_limit: 150,
    });
    if (error) throw error;
    return ((data || []) as Array<{
      id: number | string;
      dispositivo_id: string;
      evento: AppDeviceAuditEvent['event'];
      plataforma: AppDeviceAuditEvent['platform'];
      permission_status: AppDeviceAuditEvent['permissionStatus'];
      notifications_enabled: boolean | null;
      session_active: boolean | null;
      device_active: boolean | null;
      app_version: string | null;
      device_model: string | null;
      created_at: string;
    }>).map((row) => ({
      id: Number(row.id),
      deviceId: row.dispositivo_id,
      event: row.evento,
      platform: row.plataforma,
      permissionStatus: row.permission_status,
      notificationsEnabled: row.notifications_enabled,
      sessionActive: row.session_active,
      deviceActive: row.device_active,
      appVersion: row.app_version,
      deviceModel: row.device_model,
      createdAt: row.created_at,
    }));
  },
};
