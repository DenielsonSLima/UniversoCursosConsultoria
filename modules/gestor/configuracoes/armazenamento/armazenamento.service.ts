import { supabase } from '../../../../lib/supabase';

export type StorageFileType =
  | 'imagens'
  | 'pdfs'
  | 'videos'
  | 'audios'
  | 'documentos'
  | 'planilhas'
  | 'apresentacoes'
  | 'compactados'
  | 'outros';

export interface StorageTypeMetric {
  type: StorageFileType;
  objectCount: number;
  usedBytes: number;
}

export interface StorageBucketMetric {
  id: string;
  name: string;
  isPublic: boolean;
  objectCount: number;
  usedBytes: number;
}

export interface DatabaseTableMetric {
  name: string;
  usedBytes: number;
  estimatedRows: number;
}

export interface EntityMetric {
  id: string;
  label: string;
  totalCount: number;
  activeCount: number;
}

export interface StorageDashboard {
  generatedAt: string;
  storage: {
    quotaBytes: number;
    usedBytes: number;
    availableBytes: number;
    objectCount: number;
    usagePercent: number;
    byType: StorageTypeMetric[];
    byBucket: StorageBucketMetric[];
  };
  database: {
    usedBytes: number;
    largestTables: DatabaseTableMetric[];
  };
  entities: EntityMetric[];
}

const FILE_TYPE_ORDER: StorageFileType[] = [
  'imagens',
  'pdfs',
  'documentos',
  'planilhas',
  'apresentacoes',
  'videos',
  'audios',
  'compactados',
  'outros',
];

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapDashboard = (raw: any): StorageDashboard => {
  const receivedTypes = new Map<StorageFileType, StorageTypeMetric>(
    (raw?.storage?.by_type || []).map((item: any) => [
      item.type as StorageFileType,
      {
        type: item.type as StorageFileType,
        objectCount: numberValue(item.object_count),
        usedBytes: numberValue(item.used_bytes),
      },
    ]),
  );

  return {
    generatedAt: raw?.generated_at || new Date().toISOString(),
    storage: {
      quotaBytes: numberValue(raw?.storage?.quota_bytes),
      usedBytes: numberValue(raw?.storage?.used_bytes),
      availableBytes: numberValue(raw?.storage?.available_bytes),
      objectCount: numberValue(raw?.storage?.object_count),
      usagePercent: numberValue(raw?.storage?.usage_percent),
      byType: FILE_TYPE_ORDER.map((type) => receivedTypes.get(type) || {
        type,
        objectCount: 0,
        usedBytes: 0,
      }),
      byBucket: (raw?.storage?.by_bucket || []).map((item: any) => ({
        id: String(item.id || ''),
        name: String(item.name || item.id || ''),
        isPublic: Boolean(item.public),
        objectCount: numberValue(item.object_count),
        usedBytes: numberValue(item.used_bytes),
      })),
    },
    database: {
      usedBytes: numberValue(raw?.database?.used_bytes),
      largestTables: (raw?.database?.largest_tables || []).map((item: any) => ({
        name: String(item.name || ''),
        usedBytes: numberValue(item.used_bytes),
        estimatedRows: numberValue(item.estimated_rows),
      })),
    },
    entities: (raw?.entities || []).map((item: any) => ({
      id: String(item.id || ''),
      label: String(item.label || ''),
      totalCount: numberValue(item.total_count),
      activeCount: numberValue(item.active_count),
    })),
  };
};

export const armazenamentoDashboardQueryKey = ['configuracoes', 'armazenamento'] as const;

export const armazenamentoService = {
  async getDashboard(): Promise<StorageDashboard> {
    const { data, error } = await supabase.rpc('get_storage_dashboard');
    if (error) throw error;
    return mapDashboard(data);
  },
};

