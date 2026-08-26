import type {
  ClaimedPushAssetCleanup,
  PushAssetCleanupAdmin,
  PushAssetCleanupOperations,
  PushAssetCleanupStats,
} from "./types.ts";

const PUSH_IMAGE_BUCKET = "push-notification-images";
const PUSH_IMAGE_PATH_PATTERN =
  /^(?:campaigns|birthday)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png)$/;

export const canonicalPushImagePath = (value: unknown) => (
  typeof value === "string" && value === value.trim() &&
    PUSH_IMAGE_PATH_PATTERN.test(value)
    ? value
    : null
);

export const publicPushImageUrl = (supabaseUrl: string, value: unknown) => {
  const imagePath = canonicalPushImagePath(value);
  if (!imagePath) return null;
  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== "https:") return null;
    return `${base.origin}/storage/v1/object/public/${PUSH_IMAGE_BUCKET}/${imagePath}`;
  } catch {
    return null;
  }
};

const failedCleanupStats = (): PushAssetCleanupStats => ({
  claimed: 0,
  deleted: 0,
  failed: 0,
  auditFailed: 0,
  claimFailed: true,
});

export const processClaimedPushAssetCleanups = async (
  cleanups: ClaimedPushAssetCleanup[],
  workerId: string,
  operations: PushAssetCleanupOperations,
): Promise<PushAssetCleanupStats> => {
  const stats: PushAssetCleanupStats = {
    claimed: cleanups.length,
    deleted: 0,
    failed: 0,
    auditFailed: 0,
    claimFailed: false,
  };

  const processCleanup = async (cleanup: ClaimedPushAssetCleanup) => {
    let success = false;
    let publicError: string | null;
    try {
      if (
        cleanup.bucket_id !== PUSH_IMAGE_BUCKET ||
        !canonicalPushImagePath(cleanup.object_path)
      ) {
        publicError = "ASSET_CLEANUP_PATH_INVALID";
      } else {
        const revalidated = await operations.revalidate(cleanup, workerId);
        const revalidatedPath = canonicalPushImagePath(
          revalidated.objectPath,
        );
        if (
          !revalidated.eligible ||
          revalidated.bucketId !== cleanup.bucket_id ||
          revalidatedPath !== cleanup.object_path
        ) {
          publicError = (revalidated.reason ||
            "ASSET_CLEANUP_REVALIDATION_REJECTED").slice(0, 120);
        } else {
          const removed = await operations.remove(
            cleanup.bucket_id,
            cleanup.object_path,
          );
          success = removed.ok;
          publicError = success
            ? null
            : (removed.error || "STORAGE_DELETE_FAILED").slice(0, 120);
        }
      }
    } catch (error) {
      publicError = "ASSET_CLEANUP_WORKER_ERROR";
      console.error("push asset cleanup failed", {
        cleanupId: cleanup.cleanup_id,
        error,
      });
    }

    let completionAccepted = false;
    try {
      completionAccepted = await operations.complete(
        cleanup,
        workerId,
        success,
        publicError,
      );
    } catch (error) {
      console.error("push asset cleanup audit failed", {
        cleanupId: cleanup.cleanup_id,
        error,
      });
    }
    if (!completionAccepted) stats.auditFailed += 1;
    if (success && completionAccepted) stats.deleted += 1;
    else stats.failed += 1;
  };

  const concurrency = 4;
  for (let offset = 0; offset < cleanups.length; offset += concurrency) {
    await Promise.all(
      cleanups.slice(offset, offset + concurrency).map(processCleanup),
    );
  }
  return stats;
};

export const processPushAssetCleanup = async (
  admin: PushAssetCleanupAdmin,
  limit: number,
): Promise<PushAssetCleanupStats> => {
  const workerId = `asset-cleanup:${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_push_notification_asset_cleanup",
    { p_worker: workerId, p_limit: limit },
  );
  if (claimError) {
    console.error("push asset cleanup claim failed");
    return failedCleanupStats();
  }

  return await processClaimedPushAssetCleanups(
    (claimed || []) as ClaimedPushAssetCleanup[],
    workerId,
    {
      revalidate: async (cleanup, currentWorkerId) => {
        const { data, error } = await admin.rpc(
          "revalidate_push_notification_asset_cleanup",
          {
            p_cleanup_id: cleanup.cleanup_id,
            p_worker: currentWorkerId,
          },
        );
        if (error || !data || typeof data !== "object") {
          return {
            eligible: false,
            reason: "ASSET_CLEANUP_REVALIDATION_FAILED",
          };
        }
        const payload = data as Record<string, unknown>;
        return {
          eligible: payload.eligible === true,
          bucketId: typeof payload.bucketId === "string"
            ? payload.bucketId
            : undefined,
          objectPath: typeof payload.objectPath === "string"
            ? payload.objectPath
            : undefined,
          reason: typeof payload.reason === "string"
            ? payload.reason
            : undefined,
        };
      },
      remove: async (bucketId, objectPath) => {
        const { error } = await admin.storage.from(bucketId).remove([
          objectPath,
        ]);
        if (error) {
          console.error("push asset storage delete failed", { objectPath });
          return { ok: false, error: "STORAGE_DELETE_FAILED" };
        }
        return { ok: true };
      },
      complete: async (
        cleanup,
        currentWorkerId,
        success,
        error,
      ) => {
        const { data, error: completionError } = await admin.rpc(
          "complete_push_notification_asset_cleanup",
          {
            p_cleanup_id: cleanup.cleanup_id,
            p_worker: currentWorkerId,
            p_success: success,
            p_error: error,
          },
        );
        return !completionError && data === true;
      },
    },
  );
};
