import { supabase } from '../../lib/supabase';

const invokeFunction = async <T>(functionName: string, payload: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
  });
  if (error) {
    const context = (error as any).context;
    const body = context ? await context.json().catch(() => null) : null;
    throw new Error(body?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
};

const invokeAdmin = async <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
  return invokeFunction<T>('asaas-api', { action, ...payload });
};

export const asaasIntegrationService = {
  async testConnection() {
    return invokeAdmin<{ success: boolean }>('test-connection');
  },

  async syncEnrollment(matriculaId: string) {
    return invokeAdmin<{
      success: boolean;
      receivable?: any;
      skipped?: boolean;
      skippedReason?: string | null;
    }>('sync-enrollment', { matriculaId });
  },

  async syncReceivable(receivableId: string) {
    return invokeAdmin<{ success: boolean; receivable: any }>('sync-receivable', { receivableId });
  },

  async cancelReceivable(receivableId: string, environment?: 'sandbox' | 'production') {
    return invokeFunction<{
      success: boolean;
      receivable: any;
      asaasCanceled?: boolean;
      asaasDeleteStatus?: number | null;
    }>('asaas-cancel-receivable', { receivableId, environment });
  },

  async refreshReceivableStatus(receivableId: string) {
    return invokeAdmin<{ success: boolean; receivable: any }>('refresh-receivable-status', { receivableId });
  },

  async generateOfficialCarnet(receivableIds: string[]) {
    return invokeAdmin<{
      success: boolean;
      filename: string;
      contentType: string;
      base64: string;
      count: number;
    }>('generate-official-carnet', { receivableIds });
  },

  async settleInPerson(
    receivableId: string,
    params: {
      contaBancariaId: string;
      valorPago: number;
      dataPagamento: string;
      formaPagamento: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
    },
  ) {
    return invokeAdmin<{
      success: boolean;
      asaasCanceled?: boolean;
      asaasPaymentLinkCanceled?: boolean;
      asaasPaymentId?: string;
    }>('manual-settlement', { receivableId, ...params });
  },

  async reverseInPersonSettlement(
    receivableId: string,
    params: {
      recreateAsaas?: boolean;
      reason?: string;
    } = {},
  ) {
    return invokeAdmin<{ success: boolean; receivable: any; asaasRecreated?: boolean }>('reverse-manual-settlement', {
      receivableId,
      ...params,
    });
  },

  async createCourseLink(courseId: string, recreate = false) {
    void courseId;
    void recreate;
    throw new Error('Links genéricos de curso foram desativados. Use o checkout online do aluno para gerar uma cobrança no nome dele.');
  },

  async getPublicCheckout(courseId: string, alunoId: string, turmaId?: string | null) {
    const { data, error } = await supabase.functions.invoke('asaas-checkout', {
      body: { courseId, alunoId, turmaId },
    });
    if (error) {
      const context = (error as any).context;
      const body = context ? await context.json().catch(() => null) : null;
      throw new Error(body?.error || error.message);
    }
    if (data?.error) throw new Error(data.error);
    return data as { url: string };
  },
};
