export const PUSH_CAMPAIGN_CATEGORIES = [
  'institutional',
  'academic',
  'service',
  'financial',
  'marketing',
] as const;

export type PushCampaignCategory = typeof PUSH_CAMPAIGN_CATEGORIES[number];

export const PUSH_AUDIENCE_TYPES = ['all', 'polo', 'turma'] as const;

export type PushAudienceType = typeof PUSH_AUDIENCE_TYPES[number];

export const PUSH_CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'queued',
  'processing',
  'completed',
  'partial',
  'failed',
  'cancelled',
] as const;

export type PushCampaignStatus = typeof PUSH_CAMPAIGN_STATUSES[number];

export interface PushSegmentPolo {
  id: string;
  nome: string;
  eligibleUsers: number;
  eligibleDevices: number;
}

export interface PushSegmentTurma {
  id: string;
  nome: string;
  poloId: string | null;
  poloNome: string | null;
  eligibleUsers: number;
  eligibleDevices: number;
}

export interface PushSegments {
  polos: PushSegmentPolo[];
  turmas: PushSegmentTurma[];
}

export interface PushCampaignDraft {
  title: string;
  body: string;
  category: PushCampaignCategory;
  deepLink: string;
  audienceType: PushAudienceType;
  poloId: string | null;
  turmaId: string | null;
  scheduledAt: string | null;
}

export interface PushCampaignPreview {
  eligibleUsers: number;
  eligibleDevices: number;
  androidDevices: number;
  iosDevices: number;
  audienceLabel: string;
  blockedReason: string | null;
  warnings: string[];
  validationToken: string;
}

export interface PushCampaign {
  id: string;
  title: string;
  body: string;
  category: PushCampaignCategory;
  audienceType: PushAudienceType;
  poloId: string | null;
  poloName: string | null;
  turmaId: string | null;
  turmaName: string | null;
  audienceLabel: string;
  eligibleUsers: number;
  eligibleDevices: number;
  status: PushCampaignStatus;
  scheduledAt: string | null;
  createdAt: string;
  queuedAt: string | null;
  completedAt: string | null;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdByName: string | null;
  totalCount: number;
}

export interface PushCampaignListParams {
  status: PushCampaignStatus | 'all';
  search: string;
  page: number;
  pageSize: number;
}

export interface PushCampaignListResult {
  rows: PushCampaign[];
  total: number;
}

export interface CreatePushCampaignInput extends PushCampaignDraft {
  previewToken: string;
  requestId: string;
}

export interface PushCampaignMutationResult {
  id: string;
  status: PushCampaignStatus;
  requestId: string;
  replayed: boolean;
}
