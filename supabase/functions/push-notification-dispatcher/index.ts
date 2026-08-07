import { createClient } from "npm:@supabase/supabase-js@2";

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

type DeliveryFailure = {
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

type RevalidatedPushAssetCleanup = {
  eligible: boolean;
  bucketId?: string;
  objectPath?: string;
  reason?: string;
};

type PushAssetCleanupOperations = {
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

type PushAssetCleanupAdmin = {
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

export const requiredPushConsentPurpose = (
  delivery: ClaimedDelivery,
): PushConsentPurpose | null => {
  if (delivery.data?.event === "birthday") return "relationship_birthday";
  if (delivery.category === "marketing") return "commercial_marketing";
  return null;
};

export const pushConsentFailureCode = (
  delivery: ClaimedDelivery,
  lookup: PushConsentLookup,
) => {
  const purpose = requiredPushConsentPurpose(delivery);
  if (!purpose) return null;
  if (!lookup.available) return "PUSH_CONSENT_CHECK_FAILED";
  if (lookup.allowedDeliveryIds.has(delivery.delivery_id)) return null;
  return purpose === "relationship_birthday"
    ? "PUSH_RELATIONSHIP_BIRTHDAY_CONSENT_REQUIRED"
    : "PUSH_COMMERCIAL_MARKETING_CONSENT_REQUIRED";
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

const processPushAssetCleanup = async (
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const safeEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
};

const base64Url = (value: Uint8Array | string) => {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/g,
    "",
  );
};

const importPrivateKey = async (pem: string) => {
  const normalized = pem.replaceAll("\\n", "\n");
  const body = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const bytes = Uint8Array.from(
    atob(body),
    (character) => character.charCodeAt(0),
  );
  return await crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

const firebaseAccessToken = async (clientEmail: string, privateKey: string) => {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`FIREBASE_OAUTH_${response.status}`);
  }
  cachedAccessToken = {
    value: String(payload.access_token),
    expiresAt: Date.now() +
      Math.max(300, Number(payload.expires_in || 3600) - 120) * 1000,
  };
  return cachedAccessToken.value;
};

const stringData = (
  delivery: ClaimedDelivery,
  notificationId: string | null,
  imageUrl: string | null,
) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(delivery.data || {})) {
    if (value === null || value === undefined) continue;
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  for (
    const reservedKey of [
      "deep_link",
      "deepLink",
      "route",
      "path",
      "url",
      "scope",
      "category",
      "jobId",
      "job_id",
      "notificationId",
      "notification_id",
      "imagePath",
      "image_path",
      "imageUrl",
      "image_url",
    ]
  ) {
    delete result[reservedKey];
  }
  result.deepLink = delivery.deep_link;
  result.deep_link = delivery.deep_link;
  result.category = delivery.category;
  result.scope = delivery.scope;
  result.jobId = delivery.job_id;
  if (notificationId) result.notificationId = notificationId;
  if (imageUrl) result.image_url = imageUrl;
  return result;
};

const firebaseErrorCode = (body: string) => {
  try {
    const payload = JSON.parse(body) as {
      error?: {
        status?: string;
        details?: Array<{ errorCode?: string; reason?: string }>;
      };
    };
    const detail = (payload.error?.details || []).find((item) =>
      item.errorCode || item.reason
    );
    return detail?.errorCode || detail?.reason || payload.error?.status || null;
  } catch {
    return null;
  }
};

const retryAfterSeconds = (value: string | null) => {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - Date.now()) / 1000))
    : null;
};

const classifyFailure = (
  status: number,
  responseBody: string,
  retryAfter: string | null,
): DeliveryFailure => {
  const providerCode = firebaseErrorCode(responseBody);
  const invalidToken = providerCode === "UNREGISTERED" ||
    providerCode === "registration-token-not-registered" ||
    /registration-token-not-registered/i.test(responseBody);
  if (invalidToken) {
    return {
      code: "FCM_UNREGISTERED",
      disableDevice: true,
      retryable: false,
      retryAfterSeconds: null,
    };
  }
  if (status === 429) {
    return {
      code: "FCM_429",
      disableDevice: false,
      retryable: true,
      retryAfterSeconds: Math.max(60, retryAfterSeconds(retryAfter) || 60),
    };
  }
  if (status === 408 || status >= 500) {
    return {
      code: `FCM_${status}`,
      disableDevice: false,
      retryable: true,
      retryAfterSeconds: null,
    };
  }
  return {
    code: providerCode ? `FCM_${providerCode}`.slice(0, 120) : `FCM_${status}`,
    disableDevice: false,
    retryable: false,
    retryAfterSeconds: null,
  };
};

const androidChannel = (category: ClaimedDelivery["category"]) => {
  if (category === "chat" || category === "service") return "chat";
  if (category === "financial") return "financeiro";
  if (category === "academic" || category === "calendar") return "academico";
  return "geral";
};

const isUrgent = (category: ClaimedDelivery["category"]) => (
  category === "chat" || category === "service"
);

const collapseKey = (delivery: ClaimedDelivery) => {
  const value = delivery.data?.collapseKey ?? delivery.data?.collapse_key;
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 64)
    : null;
};

const remainingTtlSeconds = (delivery: ClaimedDelivery) =>
  Math.max(
    0,
    Math.floor((Date.parse(delivery.expires_at) - Date.now()) / 1000),
  );

export const buildFirebaseMessage = (
  delivery: ClaimedDelivery,
  notificationId: string | null,
  supabaseUrl: string,
  ttlSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
) => {
  const group = collapseKey(delivery);
  const urgent = isUrgent(delivery.category);
  const imageUrl = publicPushImageUrl(supabaseUrl, delivery.data?.imagePath);
  return {
    token: delivery.push_token,
    notification: {
      title: delivery.title,
      body: delivery.body,
      ...(imageUrl ? { image: imageUrl } : {}),
    },
    data: stringData(delivery, notificationId, imageUrl),
    android: {
      priority: urgent ? "high" : "normal",
      ttl: `${ttlSeconds}s`,
      ...(group ? { collapse_key: group } : {}),
      notification: {
        channel_id: androidChannel(delivery.category),
        sound: "default",
        ...(imageUrl ? { image: imageUrl } : {}),
      },
    },
    apns: {
      headers: {
        "apns-priority": urgent ? "10" : "5",
        "apns-expiration": String(nowSeconds + ttlSeconds),
        ...(group ? { "apns-collapse-id": group } : {}),
      },
      payload: {
        aps: {
          sound: "default",
          ...(imageUrl ? { "mutable-content": 1 } : {}),
        },
      },
      ...(imageUrl ? { fcm_options: { image: imageUrl } } : {}),
    },
  };
};

export const handlePushNotificationDispatch = async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID") || "";
  const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "";
  const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Ambiente Supabase incompleto." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: expectedSecret, error: secretError } = await admin.rpc(
    "get_push_notification_worker_secret",
  );
  if (secretError) return json({ error: "Executor indisponível." }, 500);
  const expectedSecretValue = typeof expectedSecret === "string"
    ? expectedSecret.trim()
    : "";
  const bearer = (req.headers.get("Authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  ).trim();
  if (
    !expectedSecretValue || !bearer || !safeEqual(bearer, expectedSecretValue)
  ) {
    return json({ error: "Não autorizado." }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
  const cleanupLimit = Math.min(
    Math.max(Number(body.cleanupLimit || 10), 1),
    25,
  );
  const cleanup = await processPushAssetCleanup(
    admin as unknown as PushAssetCleanupAdmin,
    cleanupLimit,
  );
  if (!projectId || !clientEmail || !privateKey) {
    return json({
      error: "Firebase Cloud Messaging ainda não foi configurado no executor.",
      cleanup,
    }, 503);
  }

  const workerId = `push:${crypto.randomUUID()}`;
  let accessToken: string;
  try {
    accessToken = await firebaseAccessToken(clientEmail, privateKey);
  } catch (error) {
    console.error("push dispatcher firebase auth failed", error);
    return json({
      error: "Falha de autenticação no Firebase.",
      cleanup,
    }, 503);
  }

  const regularQuota = Math.max(1, Math.ceil(limit / 2));
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_push_notification_deliveries",
    {
      p_worker: workerId,
      p_limit: regularQuota,
    },
  );
  if (claimError) {
    return json({ error: "Não foi possível reservar as notificações." }, 500);
  }

  const regularDeliveries =
    ((claimed || []) as Omit<ClaimedDelivery, "scope">[])
      .map((delivery) => ({ ...delivery, scope: "student" as const }));
  const publicQuota = Math.max(1, limit - regularDeliveries.length);
  const { data: claimedPublic, error: publicClaimError } = await admin.rpc(
    "claim_public_support_push_deliveries",
    {
      p_worker: workerId,
      p_limit: publicQuota,
    },
  );
  if (publicClaimError) {
    console.error("public support push claim failed");
  }
  const publicDeliveries = publicClaimError
    ? []
    : ((claimedPublic || []) as Omit<ClaimedDelivery, "scope">[])
      .map((delivery) => ({ ...delivery, scope: "public_support" as const }));
  const deliveries: ClaimedDelivery[] = [
    ...regularDeliveries,
    ...publicDeliveries,
  ];
  if (deliveries.length === 0) {
    const cleanupRuntimeFailed = cleanup.claimFailed || cleanup.auditFailed > 0;
    return json({
      ok: !cleanupRuntimeFailed,
      claimed: 0,
      sent: 0,
      failed: 0,
      cleanup,
    }, cleanupRuntimeFailed ? 500 : 200);
  }

  const allowedConsentDeliveryIds = new Set<string>();
  const pushConsentLookup: PushConsentLookup = {
    available: true,
    allowedDeliveryIds: allowedConsentDeliveryIds,
  };
  const consentGatedDeliveryIds = regularDeliveries
    .filter((delivery) => requiredPushConsentPurpose(delivery) !== null)
    .map((delivery) => delivery.delivery_id);
  if (consentGatedDeliveryIds.length > 0) {
    const { data: allowedRows, error: consentLookupError } = await admin.rpc(
      "push_notification_consent_allowed_deliveries",
      { p_delivery_ids: consentGatedDeliveryIds },
    );
    if (consentLookupError) {
      pushConsentLookup.available = false;
      console.error("push consent lookup failed", {
        deliveryCount: consentGatedDeliveryIds.length,
      });
    } else {
      for (const row of allowedRows || []) {
        if (typeof row.delivery_id === "string") {
          allowedConsentDeliveryIds.add(row.delivery_id);
        }
      }
    }
  }

  const notificationIdByJob = new Map<string, string>();
  const studentInboxJobIds = [
    ...new Set(
      regularDeliveries
        .filter((delivery) => delivery.category !== "chat")
        .map((delivery) => delivery.job_id),
    ),
  ];
  if (studentInboxJobIds.length > 0) {
    const { data: notificationRows, error: notificationError } = await admin
      .from("aluno_notificacoes")
      .select("id, source_job_id")
      .in("source_job_id", studentInboxJobIds);
    if (notificationError) {
      console.error("push notification inbox lookup failed", {
        jobCount: studentInboxJobIds.length,
      });
    } else {
      for (const row of notificationRows || []) {
        if (
          typeof row.id === "string" && typeof row.source_job_id === "string"
        ) {
          notificationIdByJob.set(row.source_job_id, row.id);
        }
      }
    }
  }

  let sent = 0;
  let failed = 0;
  let auditFailed = 0;
  const deliver = async (delivery: ClaimedDelivery) => {
    let success = false;
    let providerMessageId: string | null = null;
    let publicError: string | null = null;
    let disableDevice = false;
    let retryable = false;
    let retryDelaySeconds: number | null = null;
    const consentFailure = pushConsentFailureCode(
      delivery,
      pushConsentLookup,
    );
    if (consentFailure) {
      publicError = consentFailure;
      retryable = consentFailure === "PUSH_CONSENT_CHECK_FAILED";
      retryDelaySeconds = retryable ? 60 : null;
      failed += 1;
    } else {
      try {
        const ttlSeconds = remainingTtlSeconds(delivery);
        if (ttlSeconds <= 0) {
          throw new Error("Push delivery expired before dispatch.");
        }
        const imagePath = delivery.data?.imagePath;
        if (
          imagePath !== undefined && !publicPushImageUrl(supabaseUrl, imagePath)
        ) {
          console.warn("push image path ignored", {
            deliveryId: delivery.delivery_id,
          });
        }
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${
            encodeURIComponent(projectId)
          }/messages:send`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: buildFirebaseMessage(
                delivery,
                delivery.scope === "student"
                  ? notificationIdByJob.get(delivery.job_id) || null
                  : null,
                supabaseUrl,
                ttlSeconds,
              ),
            }),
            signal: AbortSignal.timeout(15_000),
          },
        );
        const responseText = await response.text();
        if (response.ok) {
          const responsePayload = JSON.parse(responseText || "{}") as {
            name?: unknown;
          };
          providerMessageId =
            typeof responsePayload.name === "string" && responsePayload.name
              ? responsePayload.name
              : null;
          if (!providerMessageId) {
            throw new Error("FCM success response without message id.");
          }
          success = true;
          sent += 1;
        } else {
          const failure = classifyFailure(
            response.status,
            responseText,
            response.headers.get("Retry-After"),
          );
          disableDevice = failure.disableDevice;
          retryable = failure.retryable;
          retryDelaySeconds = failure.retryAfterSeconds;
          publicError = failure.code;
          failed += 1;
          console.error("push delivery failed", {
            deliveryId: delivery.delivery_id,
            status: response.status,
          });
        }
      } catch (error) {
        const expired = remainingTtlSeconds(delivery) <= 0;
        publicError = expired ? "PUSH_EXPIRED" : "FCM_NETWORK_ERROR";
        retryable = !expired;
        failed += 1;
        console.error("push delivery network failure", {
          deliveryId: delivery.delivery_id,
          error,
        });
      }
    }

    const completionRpc = delivery.scope === "public_support"
      ? "complete_public_support_push_delivery"
      : "complete_push_notification_delivery_v2";
    const { data: completionAccepted, error: completeError } = await admin.rpc(
      completionRpc,
      {
        p_delivery_id: delivery.delivery_id,
        p_worker: workerId,
        p_success: success,
        p_provider_message_id: providerMessageId,
        p_error: publicError,
        p_disable_device: disableDevice,
        p_retryable: retryable,
        p_retry_after_seconds: retryDelaySeconds,
      },
    );
    if (completeError || completionAccepted !== true) {
      auditFailed += 1;
      console.error("push delivery audit failure", {
        deliveryId: delivery.delivery_id,
        rejected: !completeError && completionAccepted !== true,
      });
    }
  };

  const concurrency = 8;
  for (let offset = 0; offset < deliveries.length; offset += concurrency) {
    await Promise.all(
      deliveries.slice(offset, offset + concurrency).map(deliver),
    );
  }

  const requestFailed = auditFailed > 0 || Boolean(publicClaimError) ||
    cleanup.claimFailed || cleanup.auditFailed > 0;
  return json({
    ok: !requestFailed,
    claimed: deliveries.length,
    sent,
    failed,
    auditFailed,
    publicClaimFailed: Boolean(publicClaimError),
    cleanup,
  }, requestFailed ? 500 : 200);
};

if (import.meta.main) {
  Deno.serve(handlePushNotificationDispatch);
}
