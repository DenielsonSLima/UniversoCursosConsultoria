export const MULTICHANNEL_AUTOMATION_EVENTS = [
  'payment_due',
  'payment_received',
  'payment_overdue',
  'multiple_overdue',
  'birthday',
] as const;

export type MultichannelAutomationEvent = typeof MULTICHANNEL_AUTOMATION_EVENTS[number];

export const MULTICHANNEL_AUTOMATION_CHANNELS = [
  'app_message',
  'push',
  'whatsapp',
] as const;

export type MultichannelAutomationChannel = typeof MULTICHANNEL_AUTOMATION_CHANNELS[number];

export const MULTICHANNEL_COURSE_MODALITIES = [
  'TECNICO',
  'EAD',
  'LIVRE',
  'ESPECIALIZACAO',
  'SUPERIOR',
] as const;

export type MultichannelCourseModality = typeof MULTICHANNEL_COURSE_MODALITIES[number];

export type MultichannelAutomationStatus = 'rascunho' | 'publicada' | 'pausada' | 'arquivada';

interface MultichannelAutomationChannelBase {
  bodyTemplate: string;
  settings: Record<string, unknown>;
}

export interface AppMessageChannelConfig extends MultichannelAutomationChannelBase {
  channel: 'app_message';
  titleTemplate: string | null;
  deepLink: string | null;
}

export interface PushChannelConfig extends MultichannelAutomationChannelBase {
  channel: 'push';
  titleTemplate: string;
  deepLink: string;
  privacy: 'private';
}

export interface WhatsAppChannelConfig extends MultichannelAutomationChannelBase {
  channel: 'whatsapp';
  metaTemplateName: string | null;
  metaTemplateLanguage: string;
  category: 'utility' | 'marketing';
}

export type MultichannelAutomationChannelConfig =
  | AppMessageChannelConfig
  | PushChannelConfig
  | WhatsAppChannelConfig;

export type MultichannelRouteMode = 'parallel' | 'fallback';
export type MultichannelFallbackCondition = 'no_device' | 'delivery_failed' | 'unread';

export interface MultichannelAutomationRoute {
  modality: MultichannelCourseModality;
  channel: MultichannelAutomationChannel;
  enabled: boolean;
  mode: MultichannelRouteMode;
  priority: number;
  fallbackAfterMinutes: number | null;
  fallbackCondition: MultichannelFallbackCondition | null;
}

export type MultichannelAutomationTrigger =
  | { event: 'payment_due'; daysBefore: number; sendTime: string }
  | { event: 'payment_received'; delayMinutes: number }
  | { event: 'payment_overdue'; daysAfter: number; sendTime: string }
  | { event: 'multiple_overdue'; minimumInstallments: number; sendTime: string }
  | { event: 'birthday'; sendTime: string };

export interface MultichannelAutomationConfig {
  id: string;
  key: string;
  name: string;
  description: string | null;
  event: MultichannelAutomationEvent;
  category: 'financeiro' | 'relacionamento' | 'academico';
  purpose: 'transacional' | 'marketing';
  status: MultichannelAutomationStatus;
  enrollmentStatuses: string[];
  trigger: MultichannelAutomationTrigger;
  timezone: 'America/Maceio';
  channels: MultichannelAutomationChannelConfig[];
  routes: MultichannelAutomationRoute[];
  currentVersion: number;
}

export interface MultichannelAutomationViewModel extends MultichannelAutomationConfig {
  publishedVersion: number | null;
  executionEnabled: boolean;
  legacySource: string | null;
  updatedAt: string;
}

export interface MultichannelAutomationDraftInput {
  name: string;
  description: string | null;
  enrollmentStatuses: string[];
  trigger: MultichannelAutomationTrigger;
  channels: MultichannelAutomationChannelConfig[];
  routes: MultichannelAutomationRoute[];
}

export interface SaveMultichannelAutomationDraftInput {
  automationId: string;
  expectedVersion: number;
  requestId: string;
  reason: string;
  draft: MultichannelAutomationDraftInput;
}

export interface SaveMultichannelAutomationDraftResult {
  id: string;
  version: number;
  requestId: string;
  status: 'rascunho';
  executionEnabled: false;
  replayed?: boolean;
}

export interface MultichannelDeliverySummary {
  channel: MultichannelAutomationChannel;
  status: 'pending' | 'processing' | 'sent' | 'delivered' | 'read' | 'skipped' | 'error' | 'unknown';
  attemptedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}
