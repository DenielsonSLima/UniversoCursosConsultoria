export interface MensageriaConfigData {
  id?: string;
  tipo: 'whatsapp' | 'email';
  waProvider?: string;
  waInstanceName?: string;
  waInstanceUrl?: string;
  waToken?: string;
  waTokenConfigured?: boolean;
  waStatus?: string;
  waBusinessAccountId?: string;
  waBusinessPortfolioId?: string;
  waPhoneNumberId?: string;
  waDisplayPhoneNumber?: string;
  waGraphVersion?: string;
  waAppId?: string;
  waEmbeddedSignupConfigId?: string;
  waConnectionMode?: 'cloud_api' | 'coexistence';
  waCoexistenceVerifiedAt?: string;
  waContactsSyncStatus?: 'not_requested' | 'requested' | 'receiving' | 'completed' | 'error';
  waContactsSyncRequestId?: string;
  waHistorySyncStatus?: 'not_requested' | 'requested' | 'receiving' | 'completed' | 'declined' | 'error';
  waHistorySyncRequestId?: string;
  waHistorySyncProgress?: number;
  waLastAccountEvent?: string;
  waLastAccountEventAt?: string;
  waAppSecret?: string;
  waWebhookVerifyToken?: string;
  waAccountCurrency?: string;
  waEstimatedBalance?: number;
  waQualityRating?: string;
  waMessagingLimit?: string;
  waEnabled?: boolean;
  waLastHealthCheckAt?: string;
  waDueNoticeDays?: number;
  waSendDueNotice?: boolean;
  waDueNoticeTemplate?: string;
  waSendPaymentReceipt?: boolean;
  waPaymentReceiptTemplate?: string;
  waSendOverdueNotice?: boolean;
  waOverdueNoticeDays?: number;
  waDefaultOverdueTemplate?: string;
  waSendMultipleOverdueNotice?: boolean;
  waMultipleOverdueMinInstallments?: number;
  waMultipleOverdueTemplate?: string;
  waDueNoticeModalities?: string[];
  waPaymentReceiptModalities?: string[];
  waOverdueNoticeModalities?: string[];
  waMultipleOverdueModalities?: string[];
  smtpServer?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpSenderName?: string;
  smtpSenderEmail?: string;
}

export interface TemplateMensagem {
  id?: string;
  nome: string;
  gatilho: string;
  conteudo: string;
}

export interface WhatsAppEmbeddedSignupRequest {
  code: string;
  mode: 'coexistence';
  appId?: string;
  appSecret?: string;
  graphVersion?: string;
  configurationId?: string;
  sessionEvent: Record<string, unknown>;
}

export interface WhatsAppEmbeddedSignupResult {
  ok: boolean;
  event?: string;
  coexistenceVerified?: boolean;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  businessId?: string | null;
  isOnBizApp?: boolean | null;
  platformType?: string | null;
  displayPhoneNumber?: string | null;
  syncRequests?: Array<{ syncType: string; requestId: string | null }>;
  warnings?: string[];
}
