import { supabase } from '../../lib/supabase';
import {
  buildEnrollmentSyncPayload,
  type GatewayPaymentMethod,
} from './enrollment-sync';

export type { GatewayPaymentMethod } from './enrollment-sync';

const extractFunctionErrorMessage = async (error: any) => {
  const context = error?.context;
  const canReadJson = context && typeof context.json === 'function';
  const body = canReadJson ? await context.json().catch(() => null) : null;
  return body?.error || body?.message || error?.message || 'Erro ao comunicar com a integração bancária.';
};

const invokeFunction = async <T>(functionName: string, payload: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
  });
  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
};

const invokeAdmin = async <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
  return invokeFunction<T>('asaas-api', { action, ...payload });
};

export interface CheckoutPaymentSelection {
  method: GatewayPaymentMethod;
  installments?: number;
  presentation?: 'BOLETO' | 'PIX';
}

export interface EnrollmentPaymentOption {
  paymentMethod: GatewayPaymentMethod;
  providerCode: 'asaas' | 'mercado_pago' | 'banco_inter' | 'banese_card';
  credentialId: string;
  environment?: 'sandbox' | 'production';
}

export const asaasIntegrationService = {
  async testConnection() {
    return invokeAdmin<{ success: boolean }>('test-connection');
  },

  async syncEnrollment(
    matriculaId: string,
    paymentMethod: GatewayPaymentMethod | null,
  ) {
    return invokeAdmin<{
      success: boolean;
      receivable?: any;
      skipped?: boolean;
      skippedReason?: string | null;
    }>('sync-enrollment', buildEnrollmentSyncPayload(matriculaId, paymentMethod));
  },

  async getEnrollmentPaymentOptions(turmaId: string) {
    return invokeAdmin<{
      success: boolean;
      environment: 'sandbox' | 'production';
      modalidade: string;
      options: EnrollmentPaymentOption[];
    }>('preflight-enrollment-charge', { turmaId });
  },

  async preflightEnrollmentCharge(
    turmaId: string,
    paymentMethod: GatewayPaymentMethod,
  ) {
    return invokeAdmin<{
      success: boolean;
      environment: 'sandbox' | 'production';
      modalidade: string;
      options: EnrollmentPaymentOption[];
    }>('preflight-enrollment-charge', { turmaId, paymentMethod });
  },

  async syncReceivable(receivableId: string) {
    return invokeAdmin<{ success: boolean; receivable: any }>('sync-receivable', { receivableId });
  },

  async createOtherCredit(input: {
    idempotencyKey: string;
    poloId: string;
    descricao: string;
    valor: number;
    dataVencimento: string;
    clienteId?: string;
    categoriaFinanceiraId?: string;
    formaPagamento?: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
    contaBancariaId?: string;
    mode: 'LOCAL_PAGO' | 'LOCAL_RECEBER' | 'GATEWAY';
  }) {
    return invokeAdmin<{
      success: boolean;
      receivable: any;
      reused: boolean;
    }>('create-other-credit', input);
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
      layout?: string;
      source?: string;
    }>('generate-official-carnet', { receivableIds });
  },

  async settleInPerson(
    receivableId: string,
    params: {
      idempotencyKey: string;
      contaBancariaId: string;
      valorPago: number | string;
      valorJuros?: number | string;
      valorMulta?: number | string;
      valorDesconto?: number | string;
      valorAcrescimo?: number | string;
      dataPagamento: string;
      formaPagamento: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
    },
  ) {
    return invokeAdmin<{
      success: boolean;
      asaasCanceled?: boolean;
      asaasPaymentLinkCanceled?: boolean;
      asaasPaymentId?: string;
      baneseCanceled?: boolean;
      gatewayCanceled?: boolean;
      gatewayProvider?: string | null;
      gatewayPaymentId?: string | null;
      futureSyncWarning?: string | null;
      settlementId?: string;
      replayed?: boolean;
    }>('manual-settlement', { receivableId, ...params });
  },

  async reverseInPersonSettlement(
    receivableId: string,
    params: {
      recreateAsaas?: boolean;
      reason?: string;
    } = {},
  ) {
    return invokeAdmin<{
      success: boolean;
      receivable: any;
      asaasRecreated?: boolean;
      baneseRecreated?: boolean;
      gatewayRecreated?: boolean;
      gatewayProvider?: string | null;
      requiresDependencyCheckout?: boolean;
    }>('reverse-manual-settlement', {
      receivableId,
      ...params,
    });
  },

  async createCourseLink(courseId: string, recreate = false): Promise<{ url: string }> {
    void courseId;
    void recreate;
    throw new Error('Links diretos de curso foram desativados. Use o checkout online do aluno para gerar uma cobrança no nome dele.');
  },

  async getPublicCheckout(
    courseId: string,
    alunoId: string,
    turmaId?: string | null,
    paymentSelection?: CheckoutPaymentSelection,
  ): Promise<{
    url: string;
    alreadyPaid?: boolean;
    alreadyPending?: boolean;
    awaitingWebhook?: boolean;
    matriculaId?: string;
    receivableId?: string;
    payment?: {
      id?: string | null;
      provider?: string | null;
      method?: string | null;
      installments?: number | null;
      status?: string | null;
      value?: number | null;
      displayValue?: string | null;
      dueDate?: string | null;
      invoiceUrl?: string | null;
      bankSlipUrl?: string | null;
      courseName?: string | null;
      recipient?: {
        name?: string | null;
        document?: string | null;
      } | null;
      pixQrCode?: {
        encodedImage?: string | null;
        payload?: string | null;
        expirationDate?: string | null;
      } | null;
    };
  }> {
    const payload = {
      courseId,
      alunoId,
      turmaId,
      method: paymentSelection?.method,
      paymentMethod: paymentSelection?.method,
      installments: paymentSelection?.installments,
      eadPaymentMethod: paymentSelection?.method,
      eadInstallments: paymentSelection?.installments,
    };

    let result: {
      url: string;
      alreadyPaid?: boolean;
      alreadyPending?: boolean;
      awaitingWebhook?: boolean;
      matriculaId?: string;
      receivableId?: string;
      payment?: {
        id?: string | null;
        provider?: string | null;
        method?: string | null;
        installments?: number | null;
        status?: string | null;
        value?: number | null;
        displayValue?: string | null;
        dueDate?: string | null;
        invoiceUrl?: string | null;
        bankSlipUrl?: string | null;
        courseName?: string | null;
        recipient?: {
          name?: string | null;
          document?: string | null;
        } | null;
        pixQrCode?: {
          encodedImage?: string | null;
          payload?: string | null;
          expirationDate?: string | null;
        } | null;
      };
    };

    result = await invokeFunction<{
      url: string;
      alreadyPaid?: boolean;
      alreadyPending?: boolean;
      awaitingWebhook?: boolean;
      matriculaId?: string;
      receivableId?: string;
      payment?: {
        id?: string | null;
        provider?: string | null;
        method?: string | null;
        installments?: number | null;
        status?: string | null;
        value?: number | null;
        displayValue?: string | null;
        dueDate?: string | null;
        invoiceUrl?: string | null;
        bankSlipUrl?: string | null;
        courseName?: string | null;
        recipient?: {
          name?: string | null;
          document?: string | null;
        } | null;
        pixQrCode?: {
          encodedImage?: string | null;
          payload?: string | null;
          expirationDate?: string | null;
        } | null;
      };
    }>('payment-checkout', payload);

    if (!result?.url) {
      throw new Error('Resposta do checkout sem URL do pagamento.');
    }

    return result;
  },
};

export const paymentCheckoutService = {
  getPublicCheckout: asaasIntegrationService.getPublicCheckout,
};
