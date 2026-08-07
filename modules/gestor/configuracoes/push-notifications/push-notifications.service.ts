import { supabase } from '../../../../lib/supabase';
import {
  DEFAULT_PUSH_NOTIFICATION_POLICY,
  type PushNotificationPolicy,
} from './push-notifications.types';

type JsonRecord = Record<string, unknown>;

const asObject = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const asBoolean = (value: unknown, fallback: boolean) => (
  typeof value === 'boolean' ? value : fallback
);

const asTime = (value: unknown, fallback: string) => (
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback
);

export const normalizePushNotificationPolicy = (value: unknown): PushNotificationPolicy => {
  const source = asObject(Array.isArray(value) ? value[0] : value);
  const categories = asObject(source.categories);
  const quietHours = asObject(source.quietHours ?? source.quiet_hours);
  const defaults = DEFAULT_PUSH_NOTIFICATION_POLICY;

  return {
    enabled: asBoolean(source.enabled, defaults.enabled),
    categories: {
      chat: asBoolean(categories.chat, defaults.categories.chat),
      financial: asBoolean(categories.financial, defaults.categories.financial),
      academic: asBoolean(categories.academic, defaults.categories.academic),
      calendar: asBoolean(categories.calendar, defaults.categories.calendar),
      institutional: asBoolean(categories.institutional, defaults.categories.institutional),
      marketing: asBoolean(categories.marketing, defaults.categories.marketing),
    },
    quietHours: {
      enabled: asBoolean(quietHours.enabled, defaults.quietHours.enabled),
      start: asTime(quietHours.start, defaults.quietHours.start),
      end: asTime(quietHours.end, defaults.quietHours.end),
      timezone: 'America/Maceio',
    },
    privacy: {
      // A API nunca pode liberar conteúdo financeiro ou pessoal na tela bloqueada.
      hideSensitiveContent: true,
    },
    updatedAt: typeof source.updatedAt === 'string'
      ? source.updatedAt
      : typeof source.updated_at === 'string' ? source.updated_at : null,
  };
};

export const pushNotificationPolicyKeys = {
  all: ['configuracoes', 'push-notifications'] as const,
  policy: ['configuracoes', 'push-notifications', 'policy'] as const,
};

export const pushNotificationsService = {
  async getPolicy(): Promise<PushNotificationPolicy> {
    const { data, error } = await (supabase.rpc as any)('get_push_notification_policy');
    if (error) throw error;
    return normalizePushNotificationPolicy(data);
  },

  async updatePolicy(policy: PushNotificationPolicy): Promise<PushNotificationPolicy> {
    const payload = {
      enabled: policy.enabled,
      categories: policy.categories,
      quietHours: policy.quietHours,
      privacy: { hideSensitiveContent: true },
    };
    const { data, error } = await (supabase.rpc as any)('update_push_notification_policy', {
      p_policy: payload,
    });
    if (error) throw error;
    return normalizePushNotificationPolicy(data);
  },
};
