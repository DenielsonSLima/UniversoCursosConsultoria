import { supabase } from '../../../../lib/supabase';

export interface ProescStatus {
  configured: boolean;
  updatedAt: string | null;
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
  classes: (offset: number) => ['configuracoes', 'proesc', 'classes', offset] as const,
  events: (classId: string, offset: number) => ['configuracoes', 'proesc', 'events', classId, offset] as const,
};
export const proescService = {
  status: () => invoke<ProescStatus>('status'),
  saveToken: (token: string) => invoke('save_token', { token }),
  removeToken: () => invoke('remove_token'),
  classes: (offset = 0) => invoke<{ classes: ProescClassHistory[]; totalClasses: number }>('class_history', { offset }),
  events: (classId: string, offset = 0) => invoke<{ events: ProescHistoryEvent[]; totalEvents: number }>('class_events', { classId, offset }),
};
