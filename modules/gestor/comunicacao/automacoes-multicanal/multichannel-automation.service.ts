import { supabase } from '../../../../lib/supabase';
import {
  MultichannelAutomationChannel,
  MultichannelAutomationChannelConfig,
  MultichannelAutomationEvent,
  MultichannelAutomationRoute,
  MultichannelAutomationStatus,
  MultichannelAutomationTrigger,
  MultichannelAutomationViewModel,
  MultichannelCourseModality,
  SaveMultichannelAutomationDraftInput,
  SaveMultichannelAutomationDraftResult,
} from './multichannel-automation.types';

interface AutomationSnapshot {
  id: string;
  key: string;
  name: string;
  description: string | null;
  event: MultichannelAutomationEvent;
  category: 'financeiro' | 'relacionamento' | 'academico';
  purpose: 'transacional' | 'marketing';
  status: MultichannelAutomationStatus;
  enrollmentStatuses: string[];
  trigger: unknown;
  timezone: 'America/Maceio';
  currentVersion: number;
  publishedVersion: number | null;
  executionEnabled: boolean;
  legacySource: string | null;
  updatedAt: string;
  channels: ChannelSnapshot[];
  routes: RouteSnapshot[];
}

interface ChannelSnapshot {
  channel: MultichannelAutomationChannel;
  titleTemplate: string | null;
  bodyTemplate: string;
  deepLink: string | null;
  settings: Record<string, unknown> | null;
}

interface RouteSnapshot {
  modality: MultichannelCourseModality;
  channel: MultichannelAutomationChannel;
  enabled: boolean;
  mode: 'parallel' | 'fallback';
  priority: number;
  fallbackAfterMinutes: number | null;
  fallbackCondition: 'no_device' | 'delivery_failed' | 'unread' | null;
}

const mapChannel = (row: ChannelSnapshot): MultichannelAutomationChannelConfig => {
  const settings = row.settings || {};
  if (row.channel === 'push') {
    return {
      channel: 'push',
      titleTemplate: row.titleTemplate || 'Nova mensagem da Universo',
      bodyTemplate: row.bodyTemplate,
      deepLink: row.deepLink || '/aluno/comunicacao',
      privacy: 'private',
      settings,
    };
  }
  if (row.channel === 'whatsapp') {
    return {
      channel: 'whatsapp',
      bodyTemplate: row.bodyTemplate,
      metaTemplateName: typeof settings.metaTemplateName === 'string' ? settings.metaTemplateName : null,
      metaTemplateLanguage: typeof settings.metaTemplateLanguage === 'string' ? settings.metaTemplateLanguage : 'pt_BR',
      category: settings.category === 'marketing' ? 'marketing' : 'utility',
      settings,
    };
  }
  return {
    channel: 'app_message',
    titleTemplate: row.titleTemplate,
    bodyTemplate: row.bodyTemplate,
    deepLink: row.deepLink,
    settings,
  };
};

const mapRoute = (row: RouteSnapshot): MultichannelAutomationRoute => ({
  modality: row.modality,
  channel: row.channel,
  enabled: row.enabled,
  mode: row.mode,
  priority: row.priority,
  fallbackAfterMinutes: row.fallbackAfterMinutes,
  fallbackCondition: row.fallbackCondition,
});

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const parseTrigger = (event: MultichannelAutomationEvent, value: unknown): MultichannelAutomationTrigger => {
  if (!isObject(value) || value.event !== event) throw new Error(`Gatilho inválido para o evento ${event}.`);
  switch (event) {
    case 'payment_due':
      if (isFiniteNumber(value.daysBefore) && value.daysBefore >= 0 && isTime(value.sendTime)) return { event, daysBefore: value.daysBefore, sendTime: value.sendTime };
      break;
    case 'payment_received':
      if (isFiniteNumber(value.delayMinutes) && value.delayMinutes >= 0) return { event, delayMinutes: value.delayMinutes };
      break;
    case 'payment_overdue':
      if (isFiniteNumber(value.daysAfter) && value.daysAfter >= 0 && isTime(value.sendTime)) return { event, daysAfter: value.daysAfter, sendTime: value.sendTime };
      break;
    case 'multiple_overdue':
      if (isFiniteNumber(value.minimumInstallments) && value.minimumInstallments >= 2 && isTime(value.sendTime)) return { event, minimumInstallments: value.minimumInstallments, sendTime: value.sendTime };
      break;
    case 'birthday':
      if (isTime(value.sendTime)) return { event, sendTime: value.sendTime };
      break;
  }
  throw new Error(`Configuração incompleta para o evento ${event}.`);
};

export const multichannelAutomationService = {
  async list(): Promise<MultichannelAutomationViewModel[]> {
    const { data, error } = await supabase.rpc('comunicacao_automacoes_listar');
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Resposta inválida ao consultar automações multicanal.');

    return (data as AutomationSnapshot[]).map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      event: row.event,
      category: row.category,
      purpose: row.purpose,
      status: row.status,
      enrollmentStatuses: row.enrollmentStatuses,
      trigger: parseTrigger(row.event, row.trigger),
      timezone: row.timezone,
      channels: row.channels.map(mapChannel),
      routes: row.routes.map(mapRoute),
      currentVersion: row.currentVersion,
      publishedVersion: row.publishedVersion,
      executionEnabled: row.executionEnabled,
      legacySource: row.legacySource,
      updatedAt: row.updatedAt,
    }));
  },

  async saveDraft(input: SaveMultichannelAutomationDraftInput): Promise<SaveMultichannelAutomationDraftResult> {
    const { data, error } = await supabase.rpc('comunicacao_automacao_salvar_rascunho', {
      p_automacao_id: input.automationId,
      p_expected_version: input.expectedVersion,
      p_request_id: input.requestId,
      p_reason: input.reason,
      p_draft: input.draft,
    });
    if (error) throw error;
    if (!isObject(data) || typeof data.id !== 'string' || !isFiniteNumber(data.version) || typeof data.requestId !== 'string') {
      throw new Error('Resposta inválida ao salvar o rascunho da automação.');
    }
    return data as unknown as SaveMultichannelAutomationDraftResult;
  },
};
