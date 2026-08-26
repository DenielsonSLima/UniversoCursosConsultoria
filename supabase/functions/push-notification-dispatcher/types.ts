export type ClaimedDelivery = {
  scope: "student" | "public_support";
  delivery_id: string;
  job_id: string;
  campaign_id: string | null;
  device_id: string;
  push_token: string;
  platform: "android" | "ios";
  category:
    | "chat"
    | "service"
    | "financial"
    | "academic"
    | "calendar"
    | "institutional"
    | "marketing";
  title: string;
  body: string;
  deep_link: string;
  data: Record<string, unknown>;
  expires_at: string;
};

export type DeliveryFailure = {
  code: string;
  disableDevice: boolean;
  retryable: boolean;
  retryAfterSeconds: number | null;
};

export type PushConsentLookup = {
  available: boolean;
  allowedDeliveryIds: ReadonlySet<string>;
};

export type PushConsentPurpose =
  | "relationship_birthday"
  | "commercial_marketing";

export type ClaimedPushAssetCleanup = {
  cleanup_id: string;
  asset_id: string;
  bucket_id: string;
  object_path: string;
};

export type RevalidatedPushAssetCleanup = {
  eligible: boolean;
  bucketId?: string;
  objectPath?: string;
  reason?: string;
};

export type PushAssetCleanupOperations = {
  revalidate: (
    cleanup: ClaimedPushAssetCleanup,
    workerId: string,
  ) => Promise<RevalidatedPushAssetCleanup>;
  remove: (bucketId: string, objectPath: string) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  complete: (
    cleanup: ClaimedPushAssetCleanup,
    workerId: string,
    success: boolean,
    error: string | null,
  ) => Promise<boolean>;
};

export type PushAssetCleanupAdmin = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  storage: {
    from: (bucketId: string) => {
      remove: (
        objectPaths: string[],
      ) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

export type PushAssetCleanupStats = {
  claimed: number;
  deleted: number;
  failed: number;
  auditFailed: number;
  claimFailed: boolean;
};

export type PushDeliveryRevalidation = {
  eligible: boolean;
  reason: string | null;
};
