import { supabase } from '../../../../lib/supabase';

export interface ProescRun {
  id: string;
  resource: 'people' | 'invoices';
  filters: { unitId: string; start: string; end: string };
  status: 'running' | 'complete';
  pages: number;
  records: number;
  created_at: string;
  updated_at: string;
  cursor: { year: number; month: number; page: number } | null;
}
export interface ProescStatus {
  configured: boolean;
  updatedAt: string | null;
  consultations: ProescRun[];
  totalConsultations: number;
}
export interface LegacyStudent {
  enrollmentId: string;
  studentName: string;
  status: string;
  receivables: Array<{
    id: string; description: string; dueDate: string; amount: number;
    paidAmount: number | null; paymentDate: string | null; status: string; legacyId: string;
  }>;
}
export interface ProescPage {
  run: ProescRun;
  page: { records: Record<string, unknown>[]; consultedAt: string; period: string | null } | null;
}

// Credenciais são enviadas uma vez; não entram em query keys, storage ou mutation cache.
async function invoke<T>(action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('proesc-api', { body: { action, ...payload } });
  if (error) {
    let message = 'Não foi possível acessar o Proesc. Confira sua conexão e as permissões.';
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
  status: ['configuracoes', 'proesc', 'status'] as const,
  history: ['configuracoes', 'proesc', 't42-history'] as const,
  page: (id: string, position: number) => ['configuracoes', 'proesc', 'page', id, position] as const,
};
export const proescService = {
  status: (offset = 0) => invoke<ProescStatus>('status', { offset }),
  saveToken: (token: string) => invoke('save_token', { token }),
  removeToken: () => invoke('remove_token'),
  test: () => invoke<{ message: string }>('test'),
  history: () => invoke<{ classCode: string; students: LegacyStudent[] }>('history_t42'),
  start: (resource: ProescRun['resource'], filters: ProescRun['filters']) => invoke<ProescRun>('start', { resource, filters }),
  advance: (id: string) => invoke<ProescRun>('advance', { id }),
  page: (id: string, position: number) => invoke<ProescPage>('page', { id, position }),
};
