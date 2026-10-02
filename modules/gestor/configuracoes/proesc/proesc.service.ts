import { supabase } from '../../../../lib/supabase';

export interface ProescStatus {
  configured: boolean;
  updatedAt: string | null;
}
export type ProescVersion = 'v2';
export interface ProescConnectionStatus extends ProescStatus {
  version: ProescVersion;
  wafConfigured: boolean;
}
export interface ProescTokenTest {
  ok: boolean;
  checkedAt: string;
  checks: Array<{
    resource: 'people' | 'invoices';
    ok: boolean;
    status: number;
    message: string;
  }>;
  message: string;
}
export interface ProescClassHistory {
  classId: string;
  classCode: string;
  className: string;
  operation: string;
  source: string;
  status: string;
  lastEventAt: string | null;
  eventsCount: number;
  records: number;
}
export interface ProescHistoryEvent {
  id: string;
  operation: string;
  status: string;
  source: string;
  occurredAt: string | null;
  records: number;
  summary: string;
}

// Token enviado uma vez; não entra em storage, query keys ou cache de mutations.
async function invoke<T>(action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('proesc-api', { body: { action, ...payload } });
  if (error) {
    let message = 'Não foi possível acessar a configuração Proesc.';
    if (error.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      if (typeof body?.error === 'string') message = body.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const proescKeys = {
  status: ['configuracoes', 'proesc', 'connection-v2'] as const,
  connection: (version: ProescVersion) => ['configuracoes', 'proesc', 'connection', version] as const,
  classes: (offset: number) => ['configuracoes', 'proesc', 'classes', offset] as const,
  events: (classId: string, offset: number) => ['configuracoes', 'proesc', 'events', classId, offset] as const,
};

async function connectionInvoke<T>(version: ProescVersion, action: string, payload: object = {}): Promise<T> {
  if (version !== 'v2') throw new Error('A conexão Proesc V1 foi encerrada. Utilize a V2.');
  return invoke<T>(action, { ...payload, version });
}

export const proescService = {
  connectionStatus: (version: ProescVersion) => connectionInvoke<ProescConnectionStatus>(version, 'connection_status'),
  saveConnection: (version: ProescVersion, token: string, wafHeader?: string) => connectionInvoke<ProescConnectionStatus>(
    version, 'save_connection', { token, ...(wafHeader?.trim() ? { wafHeader: wafHeader.trim() } : {}) },
  ),
  removeConnection: (version: ProescVersion) => connectionInvoke<ProescConnectionStatus>(version, 'remove_connection'),
  testConnection: (version: ProescVersion) => connectionInvoke<ProescTokenTest>(version, 'test_connection'),
  status: () => connectionInvoke<ProescStatus>('v2', 'connection_status'),
  saveToken: (token: string) => connectionInvoke('v2', 'save_connection', { token }),
  removeToken: () => connectionInvoke('v2', 'remove_connection'),
  testToken: () => connectionInvoke<ProescTokenTest>('v2', 'test_connection'),
  classes: (offset = 0) => invoke<{ classes: ProescClassHistory[]; totalClasses: number }>('class_history', { offset }),
  events: (classId: string, offset = 0) => invoke<{ events: ProescHistoryEvent[]; totalEvents: number }>('class_events', { classId, offset }),
};
