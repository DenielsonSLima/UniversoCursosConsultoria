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
  sourceJobId: string | null;
  sourceType: string;
  category: AlunoNotificationCategory;
  title: string;
  body: string;
  deepLink: string;
  imageAssetId: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  visibleAt: string;
  readAt: string | null;
  createdAt: string;
}

export interface AlunoNotificationCursor {
  snapshotAt: string;
  visibleAt: string;
  id: string;
}

export interface AlunoNotificationPage {
  items: AlunoNotification[];
  nextCursor: AlunoNotificationCursor | null;
}

export interface AlunoRelationshipBirthdayPreference {
  configured: boolean;
  allowed: boolean;
  updatedAt: string | null;
  policyVersion: string;
  legalBasis: 'legitimo_interesse';
  activationReason: string | null;
  includesCommercialAdvertising: false;
  canOptOut: true;
}
