import type { PublicCheckoutResult } from './checkout-result';
import { supabase } from '../../lib/supabase';
import {
  buildEnrollmentSyncPayload,
  type GatewayPaymentMethod,
} from './enrollment-sync';
import {
  createReceivableIssuanceRequestId,
  syncAfterExplicitReceivableIssuanceAuthorization,
} from './manual-technical-receivable-issuance';

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

const authorizeManualTechnicalReceivableIssuance = async (
  receivableId: string,
  requestId: string,
) => {
  const { data, error } = await (supabase.rpc as any)(
    'authorize_technical_manual_receivable_issuance_secure',
    {
      p_receivable_id: receivableId,
      p_request_id: requestId,
    },
  );
  if (error) throw new Error(error.message || 'Não foi possível autorizar a emissão.');
  if (
    !data || typeof data !== 'object' || typeof data.required !== 'boolean' ||
    (data.required === true && data.authorized !== true)
  ) {
    throw new Error('A autorização da emissão retornou um estado inválido.');
  }
};

export interface CheckoutPaymentSelection {
  method: GatewayPaymentMethod;
  installments?: number;
  presentation?: 'BOLETO' | 'PIX';
}

export interface StudentEadPaymentOption {
  id: GatewayPaymentMethod;
  label: string;
  checkoutMethod: GatewayPaymentMethod;
  presentation?: 'BOLETO' | 'PIX';
}

export interface StudentEadPaymentOptionsResult {
  success: true;
  modalidade: 'EAD';
  options: StudentEadPaymentOption[];
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
    return syncAfterExplicitReceivableIssuanceAuthorization({
      receivableId,
      requestId: createReceivableIssuanceRequestId(),
      authorize: authorizeManualTechnicalReceivableIssuance,
      sync: (id) => invokeAdmin<{ success: boolean; receivable: any }>(
        'sync-receivable',
        { receivableId: id },
      ),
    });
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
    receivableId?: string | null,
    requestId: string = crypto.randomUUID(),
  ): Promise<PublicCheckoutResult> {
    const result = await invokeFunction<PublicCheckoutResult>('payment-checkout', {
      courseId, alunoId, turmaId, receivableId, requestId,
      method: paymentSelection?.method,
      paymentMethod: paymentSelection?.method,
      installments: paymentSelection?.installments,
      eadPaymentMethod: paymentSelection?.method,
      eadInstallments: paymentSelection?.installments,
      presentation: paymentSelection?.presentation,
    });
    if (!result?.url) throw new Error('Resposta do checkout sem URL do pagamento.');
    return result;
  },

  async getStudentEadPaymentOptions(
    receivableId: string,
  ): Promise<StudentEadPaymentOptionsResult> {
    return invokeFunction<StudentEadPaymentOptionsResult>('payment-checkout', {
      action: 'payment-options',
      receivableId,
    });
  },
};

export const paymentCheckoutService = {
  getPublicCheckout: asaasIntegrationService.getPublicCheckout,
  getStudentEadPaymentOptions: asaasIntegrationService.getStudentEadPaymentOptions,
};
