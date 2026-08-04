export type PushNotificationCategory =
  | 'chat'
  | 'financial'
  | 'academic'
  | 'calendar'
  | 'institutional'
  | 'marketing';

export interface PushNotificationPolicy {
  enabled: boolean;
  categories: Record<PushNotificationCategory, boolean>;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: 'America/Maceio';
  };
  privacy: {
    hideSensitiveContent: boolean;
  };
  updatedAt: string | null;
}

export const DEFAULT_PUSH_NOTIFICATION_POLICY: PushNotificationPolicy = {
  enabled: true,
  categories: {
    chat: true,
    financial: true,
    academic: true,
    calendar: true,
    institutional: true,
    marketing: false,
  },
  quietHours: {
    enabled: true,
    start: '22:00',
    end: '07:00',
    timezone: 'America/Maceio',
  },
  privacy: {
    hideSensitiveContent: true,
  },
  updatedAt: null,
};
