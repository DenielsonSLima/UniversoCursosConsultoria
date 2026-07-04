import { supabase } from '../../../../lib/supabase';

export interface AsaasConfigData {
  id?: string;
  environment: 'sandbox' | 'production';
  walletId: string;
  configured: boolean;
  apiConfigured: boolean;
  webhookConfigured: boolean;
  lastTestAt?: string;
  lastTestStatus?: string;
  lastTestMessage?: string;
  webhookUrl: string;
  webhookToken: string;
  notificationsEnabled: boolean;
  notificationWhatsappEnabled: boolean;
  notificationEmailEnabled: boolean;
  notificationSmsEnabled: boolean;
}

const extractFunctionErrorMessage = async (error: any) => {
  const context = error?.context;
  const canReadJson = context && typeof context.json === 'function';
  const body = canReadJson ? await context.json().catch(() => null) : null;
  return body?.error || body?.message || error?.message || 'Erro ao comunicar com o Asaas.';
};

const invoke = async <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('asaas-api', {
    body: { action, ...payload },
  });
  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
};

export const asaasService = {
  async getConfig(environment: 'sandbox' | 'production' = 'sandbox'): Promise<AsaasConfigData> {
    const data = await invoke<any>('get-config', { environment });
    return {
      id: data.id,
      environment: data.environment as 'sandbox' | 'production',
      walletId: data.wallet_id || '',
      configured: Boolean(data.configured),
      apiConfigured: Boolean(data.apiConfigured ?? data.configured),
      webhookConfigured: Boolean(data.webhookConfigured ?? data.webhookToken),
      lastTestAt: data.last_test_at || undefined,
      lastTestStatus: data.last_test_status || undefined,
      lastTestMessage: data.last_test_message || undefined,
      webhookUrl: data.webhookUrl,
      webhookToken: data.webhookToken,
      notificationsEnabled: Boolean(data.notificationsEnabled),
      notificationWhatsappEnabled: Boolean(data.notificationWhatsappEnabled),
      notificationEmailEnabled: Boolean(data.notificationEmailEnabled),
      notificationSmsEnabled: Boolean(data.notificationSmsEnabled),
    };
  },

  async saveConfig(config: {
    environment: 'sandbox' | 'production';
    apiKey: string;
    webhookToken: string;
    walletId: string;
    notificationsEnabled: boolean;
    notificationWhatsappEnabled: boolean;
    notificationEmailEnabled: boolean;
    notificationSmsEnabled: boolean;
  }): Promise<boolean> {
    await invoke('save-config', config);
    return true;
  },

  async saveNotificationPreferences(preferences: {
    notificationWhatsappEnabled: boolean;
    notificationEmailEnabled: boolean;
    notificationSmsEnabled: boolean;
  }): Promise<boolean> {
    await invoke('save-notification-preferences', preferences);
    return true;
  },

  async testConnection(environment: 'sandbox' | 'production'): Promise<void> {
    await invoke('test-connection', { environment });
  },
};
