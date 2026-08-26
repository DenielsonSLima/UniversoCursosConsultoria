import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildFirebaseMessage,
  classifyFailure,
  firebaseAccessToken,
  remainingTtlSeconds,
} from "./firebase.ts";
import {
  canonicalPushImagePath,
  processClaimedPushAssetCleanups,
  processPushAssetCleanup,
  publicPushImageUrl,
} from "./push-assets.ts";
import type {
  ClaimedDelivery,
  PushAssetCleanupAdmin,
  PushConsentLookup,
  PushConsentPurpose,
  PushDeliveryRevalidation,
} from "./types.ts";

export type {
  ClaimedDelivery,
  ClaimedPushAssetCleanup,
  PushAssetCleanupStats,
  PushConsentLookup,
  PushConsentPurpose,
} from "./types.ts";
export {
  buildFirebaseMessage,
  canonicalPushImagePath,
  processClaimedPushAssetCleanups,
  publicPushImageUrl,
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

export const normalizePushDeliveryRevalidation = (
  value: unknown,
): PushDeliveryRevalidation => {
  if (!value || typeof value !== "object") {
    return {
      eligible: false,
      reason: "PUSH_FINANCIAL_REVALIDATION_FAILED",
    };
  }
  const payload = value as Record<string, unknown>;
  if (payload.eligible === true) return { eligible: true, reason: null };
  return {
    eligible: false,
    reason: typeof payload.reason === "string" && payload.reason
      ? payload.reason.slice(0, 120)
      : "PUSH_FINANCIAL_REVALIDATION_FAILED",
  };
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
    { p_worker: workerId, p_limit: regularQuota },
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
    { p_worker: workerId, p_limit: publicQuota },
  );
  if (publicClaimError) console.error("public support push claim failed");
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
      skipped: 0,
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
  let skipped = 0;
  let auditFailed = 0;
  const deliver = async (delivery: ClaimedDelivery) => {
    let success = false;
    let providerMessageId: string | null = null;
    let publicError: string | null = null;
    let disableDevice = false;
    let retryable = false;
    let retryDelaySeconds: number | null = null;
    const consentFailure = pushConsentFailureCode(delivery, pushConsentLookup);
    if (consentFailure) {
      publicError = consentFailure;
      retryable = consentFailure === "PUSH_CONSENT_CHECK_FAILED";
      retryDelaySeconds = retryable ? 60 : null;
      failed += 1;
    } else {
      let maySend = true;
      if (delivery.scope === "student" && delivery.category === "financial") {
        const { data, error } = await admin.rpc(
          "revalidate_push_notification_delivery_before_send",
          {
            p_delivery_id: delivery.delivery_id,
            p_worker: workerId,
          },
        );
        const revalidation = error
          ? {
            eligible: false,
            reason: "PUSH_FINANCIAL_REVALIDATION_FAILED",
          }
          : normalizePushDeliveryRevalidation(data);
        if (!revalidation.eligible) {
          maySend = false;
          publicError = revalidation.reason;
          if (
            error ||
            revalidation.reason === "PUSH_FINANCIAL_REVALIDATION_FAILED"
          ) {
            retryable = true;
            retryDelaySeconds = 60;
            failed += 1;
          } else {
            skipped += 1;
            // A RPC cancela o job; o trigger canônico move deliveries abertos
            // para `skipped`, portanto não há conclusão pendente neste ramo.
            return;
          }
        }
      }

      if (maySend) {
        try {
          const ttlSeconds = remainingTtlSeconds(delivery);
          if (ttlSeconds <= 0) {
            throw new Error("Push delivery expired before dispatch.");
          }
          const imagePath = delivery.data?.imagePath;
          if (
            imagePath !== undefined &&
            !publicPushImageUrl(supabaseUrl, imagePath)
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
            providerMessageId = typeof responsePayload.name === "string" &&
                responsePayload.name
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
    skipped,
    auditFailed,
    publicClaimFailed: Boolean(publicClaimError),
    cleanup,
  }, requestFailed ? 500 : 200);
};

if (import.meta.main) Deno.serve(handlePushNotificationDispatch);
