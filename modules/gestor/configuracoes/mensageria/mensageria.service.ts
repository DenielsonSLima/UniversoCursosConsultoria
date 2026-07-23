import { supabase } from '../../../../lib/supabase';
import {
  MensageriaConfigData,
  TemplateMensagem,
  WhatsAppEmbeddedSignupRequest,
  WhatsAppEmbeddedSignupResult,
} from './mensageria.types';

export type {
  MensageriaConfigData,
  TemplateMensagem,
  WhatsAppEmbeddedSignupRequest,
  WhatsAppEmbeddedSignupResult,
} from './mensageria.types';

export const mensageriaService = {
  /**
   * Obtém a configuração de mensageria para o tipo especificado ('whatsapp' ou 'email')
   */
  async getConfig(tipo: 'whatsapp' | 'email'): Promise<MensageriaConfigData | null> {
    const { data, error } = await supabase
      .from('mensageria_config')
      .select(`
        id,
        tipo,
        wa_provider,
        wa_instance_name,
        wa_instance_url,
        wa_status,
        wa_business_account_id,
        wa_business_portfolio_id,
        wa_phone_number_id,
        wa_display_phone_number,
        wa_graph_version,
        wa_app_id,
        wa_embedded_signup_config_id,
        wa_connection_mode,
        wa_coexistence_verified_at,
        wa_contacts_sync_status,
        wa_contacts_sync_request_id,
        wa_history_sync_status,
        wa_history_sync_request_id,
        wa_history_sync_progress,
        wa_last_account_event,
        wa_last_account_event_at,
        wa_webhook_verify_token,
        wa_account_currency,
        wa_estimated_balance,
        wa_quality_rating,
        wa_messaging_limit,
        wa_enabled,
        wa_last_health_check_at,
        wa_due_notice_days,
        wa_send_due_notice,
        wa_due_notice_template,
        wa_send_payment_receipt,
        wa_payment_receipt_template,
        wa_send_overdue_notice,
        wa_overdue_notice_days,
        wa_default_overdue_template,
        wa_send_multiple_overdue_notice,
        wa_multiple_overdue_min_installments,
        wa_multiple_overdue_template,
        wa_due_notice_modalities,
        wa_payment_receipt_modalities,
        wa_overdue_notice_modalities,
        wa_multiple_overdue_modalities,
        smtp_server,
        smtp_port,
        smtp_user,
        smtp_sender_name,
        smtp_sender_email
      `)
      .eq('tipo', tipo)
      .maybeSingle();

    if (error) {
      console.error(`Erro ao buscar config de ${tipo}:`, error);
      throw new Error(error.message);
    }

    if (!data) return null;

    return {
      id: data.id,
      tipo: data.tipo,
      waProvider: data.wa_provider,
      waInstanceName: data.wa_instance_name,
      waInstanceUrl: data.wa_instance_url,
      waTokenConfigured: data.wa_status === 'configurado',
      waStatus: data.wa_status,
      waBusinessAccountId: data.wa_business_account_id,
      waBusinessPortfolioId: data.wa_business_portfolio_id,
      waPhoneNumberId: data.wa_phone_number_id,
      waDisplayPhoneNumber: data.wa_display_phone_number,
      waGraphVersion: data.wa_graph_version,
      waAppId: data.wa_app_id,
      waEmbeddedSignupConfigId: data.wa_embedded_signup_config_id,
      waConnectionMode: data.wa_connection_mode,
      waCoexistenceVerifiedAt: data.wa_coexistence_verified_at,
      waContactsSyncStatus: data.wa_contacts_sync_status,
      waContactsSyncRequestId: data.wa_contacts_sync_request_id,
      waHistorySyncStatus: data.wa_history_sync_status,
      waHistorySyncRequestId: data.wa_history_sync_request_id,
      waHistorySyncProgress: data.wa_history_sync_progress === null || data.wa_history_sync_progress === undefined
        ? undefined
        : Number(data.wa_history_sync_progress),
      waLastAccountEvent: data.wa_last_account_event,
      waLastAccountEventAt: data.wa_last_account_event_at,
      waWebhookVerifyToken: data.wa_webhook_verify_token,
      waAccountCurrency: data.wa_account_currency,
      waEstimatedBalance: data.wa_estimated_balance === null || data.wa_estimated_balance === undefined
        ? undefined
        : Number(data.wa_estimated_balance),
      waQualityRating: data.wa_quality_rating,
      waMessagingLimit: data.wa_messaging_limit,
      waEnabled: data.wa_enabled,
      waLastHealthCheckAt: data.wa_last_health_check_at,
      waDueNoticeDays: data.wa_due_notice_days === null || data.wa_due_notice_days === undefined
        ? undefined
        : Number(data.wa_due_notice_days),
      waSendDueNotice: data.wa_send_due_notice,
      waDueNoticeTemplate: data.wa_due_notice_template,
      waSendPaymentReceipt: data.wa_send_payment_receipt,
      waPaymentReceiptTemplate: data.wa_payment_receipt_template,
      waSendOverdueNotice: data.wa_send_overdue_notice,
      waOverdueNoticeDays: data.wa_overdue_notice_days === null || data.wa_overdue_notice_days === undefined
        ? undefined
        : Number(data.wa_overdue_notice_days),
      waDefaultOverdueTemplate: data.wa_default_overdue_template,
      waSendMultipleOverdueNotice: data.wa_send_multiple_overdue_notice,
      waMultipleOverdueMinInstallments: data.wa_multiple_overdue_min_installments === null || data.wa_multiple_overdue_min_installments === undefined
        ? undefined
        : Number(data.wa_multiple_overdue_min_installments),
      waMultipleOverdueTemplate: data.wa_multiple_overdue_template,
      waDueNoticeModalities: data.wa_due_notice_modalities || undefined,
      waPaymentReceiptModalities: data.wa_payment_receipt_modalities || undefined,
      waOverdueNoticeModalities: data.wa_overdue_notice_modalities || undefined,
      waMultipleOverdueModalities: data.wa_multiple_overdue_modalities || undefined,
      smtpServer: data.smtp_server,
      smtpPort: data.smtp_port,
      smtpUser: data.smtp_user,
      smtpSenderName: data.smtp_sender_name,
      smtpSenderEmail: data.smtp_sender_email
    };
  },

  /**
   * Salva ou atualiza as configurações de mensageria
   */
  async saveConfig(tipo: 'whatsapp' | 'email', config: Partial<MensageriaConfigData>): Promise<boolean> {
    if (tipo === 'whatsapp') {
      const { data, error } = await supabase.functions.invoke('whatsapp-config', {
        body: config,
      });

      if (error) {
        console.error('Erro ao salvar config de whatsapp:', error);
        const context = (error as any)?.context;
        const details = typeof context?.json === 'function'
          ? await context.json().catch(() => null)
          : null;
        throw new Error(details?.error || error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return true;
    }

    const dbPayload: any = {
      tipo,
      wa_provider: config.waProvider,
      wa_instance_name: config.waInstanceName,
      wa_instance_url: config.waInstanceUrl,
      wa_status: config.waStatus,
      wa_business_account_id: config.waBusinessAccountId,
      wa_phone_number_id: config.waPhoneNumberId,
      wa_display_phone_number: config.waDisplayPhoneNumber,
      wa_graph_version: config.waGraphVersion,
      wa_app_id: config.waAppId,
      wa_embedded_signup_config_id: config.waEmbeddedSignupConfigId,
      wa_webhook_verify_token: config.waWebhookVerifyToken,
      wa_account_currency: config.waAccountCurrency,
      wa_estimated_balance: config.waEstimatedBalance,
      wa_quality_rating: config.waQualityRating,
      wa_messaging_limit: config.waMessagingLimit,
      wa_enabled: config.waEnabled,
      wa_last_health_check_at: config.waLastHealthCheckAt,
      wa_due_notice_days: config.waDueNoticeDays,
      wa_send_due_notice: config.waSendDueNotice,
      wa_due_notice_template: config.waDueNoticeTemplate,
      wa_send_payment_receipt: config.waSendPaymentReceipt,
      wa_payment_receipt_template: config.waPaymentReceiptTemplate,
      wa_send_overdue_notice: config.waSendOverdueNotice,
      wa_overdue_notice_days: config.waOverdueNoticeDays,
      wa_default_overdue_template: config.waDefaultOverdueTemplate,
      wa_send_multiple_overdue_notice: config.waSendMultipleOverdueNotice,
      wa_multiple_overdue_min_installments: config.waMultipleOverdueMinInstallments,
      wa_multiple_overdue_template: config.waMultipleOverdueTemplate,
      wa_due_notice_modalities: config.waDueNoticeModalities,
      wa_payment_receipt_modalities: config.waPaymentReceiptModalities,
      wa_overdue_notice_modalities: config.waOverdueNoticeModalities,
      wa_multiple_overdue_modalities: config.waMultipleOverdueModalities,
      smtp_server: config.smtpServer,
      smtp_port: config.smtpPort,
      smtp_user: config.smtpUser,
      smtp_pass: config.smtpPass,
      smtp_sender_name: config.smtpSenderName,
      smtp_sender_email: config.smtpSenderEmail
    };

    // Remove campos indefinidos
    Object.keys(dbPayload).forEach(key => {
      if (dbPayload[key] === undefined) delete dbPayload[key];
    });

    const { error } = await supabase
      .from('mensageria_config')
      .upsert(dbPayload, { onConflict: 'tipo' });

    if (error) {
      console.error(`Erro ao salvar config de ${tipo}:`, error);
      throw new Error(error.message);
    }

    return true;
  },

  async completeWhatsAppEmbeddedSignup(payload: WhatsAppEmbeddedSignupRequest): Promise<WhatsAppEmbeddedSignupResult> {
    const { data, error } = await supabase.functions.invoke('whatsapp-embedded-signup', {
      body: payload,
    });

    if (error) {
      console.error('Erro ao concluir Embedded Signup do WhatsApp:', error);
      const context = (error as any)?.context;
      const details = typeof context?.json === 'function'
        ? await context.json().catch(() => null)
        : null;
      throw new Error(details?.error || error.message);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data as WhatsAppEmbeddedSignupResult;
  },

  async saveWhatsappAutomationConfig(config: Partial<MensageriaConfigData>): Promise<boolean> {
    const dbPayload: any = {
      tipo: 'whatsapp',
      wa_due_notice_days: config.waDueNoticeDays,
      wa_send_due_notice: config.waSendDueNotice,
      wa_due_notice_template: config.waDueNoticeTemplate,
      wa_send_payment_receipt: config.waSendPaymentReceipt,
      wa_payment_receipt_template: config.waPaymentReceiptTemplate,
      wa_send_overdue_notice: config.waSendOverdueNotice,
      wa_overdue_notice_days: config.waOverdueNoticeDays,
      wa_default_overdue_template: config.waDefaultOverdueTemplate,
      wa_send_multiple_overdue_notice: config.waSendMultipleOverdueNotice,
      wa_multiple_overdue_min_installments: config.waMultipleOverdueMinInstallments,
      wa_multiple_overdue_template: config.waMultipleOverdueTemplate,
      wa_due_notice_modalities: config.waDueNoticeModalities,
      wa_payment_receipt_modalities: config.waPaymentReceiptModalities,
      wa_overdue_notice_modalities: config.waOverdueNoticeModalities,
      wa_multiple_overdue_modalities: config.waMultipleOverdueModalities,
    };

    Object.keys(dbPayload).forEach(key => {
      if (dbPayload[key] === undefined) delete dbPayload[key];
    });

    const { error } = await supabase
      .from('mensageria_config')
      .upsert(dbPayload, { onConflict: 'tipo' });

    if (error) {
      console.error('Erro ao salvar automações do WhatsApp:', error);
      throw new Error(error.message);
    }

    return true;
  },

  /**
   * Retorna todos os templates de mensagens cadastrados
   */
  async getTemplates(): Promise<TemplateMensagem[]> {
    const { data, error } = await supabase
      .from('templates_mensagens')
      .select('*')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar templates de mensagens:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  /**
   * Cria um novo template de mensagem
   */
  async createTemplate(template: Omit<TemplateMensagem, 'id'>): Promise<TemplateMensagem> {
    const { data, error } = await supabase
      .from('templates_mensagens')
      .insert(template)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar template:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Atualiza um template de mensagem existente
   */
  async updateTemplate(id: string, template: Partial<TemplateMensagem>): Promise<TemplateMensagem> {
    const { data, error } = await supabase
      .from('templates_mensagens')
      .update(template)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar template:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Exclui um template de mensagem
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('templates_mensagens')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir template:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
