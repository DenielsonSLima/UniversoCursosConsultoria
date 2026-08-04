export type AlunoNotificationCategory =
  | 'service'
  | 'financial'
  | 'academic'
  | 'calendar'
  | 'institutional'
  | 'marketing';

export type AlunoNotificationFilter =
  | 'all'
  | 'unread'
  | 'financial'
  | 'academic'
  | 'institutional';

export interface AlunoNotification {
  id: string;
  alunoId: string;
  sourceType: string;
  category: AlunoNotificationCategory;
  title: string;
  body: string;
  deepLink: string;
  visibleAt: string;
  readAt: string | null;
  createdAt: string;
}
