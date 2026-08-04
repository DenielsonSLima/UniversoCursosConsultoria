import { createClient } from "npm:@supabase/supabase-js@2";

type ClaimedDelivery = {
  scope: "student" | "public_support";
  delivery_id: string;
  job_id: string;
  campaign_id: string | null;
  device_id: string;
  push_token: string;
  platform: "android" | "ios";
  category: "chat" | "service" | "financial" | "academic" | "calendar" | "institutional" | "marketing";
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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
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
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
};

const importPrivateKey = async (pem: string) => {
  const normalized = pem.replaceAll("\\n", "\n");
  const body = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const bytes = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
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
    expiresAt: Date.now() + Math.max(300, Number(payload.expires_in || 3600) - 120) * 1000,
  };
  return cachedAccessToken.value;
};

const stringData = (data: Record<string, unknown>, deepLink: string) => {
  const result: Record<string, string> = { deepLink };
  for (const [key, value] of Object.entries(data || {})) {
    if (value === null || value === undefined) continue;
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
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
    const detail = (payload.error?.details || []).find((item) => item.errorCode || item.reason);
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
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
};

const classifyFailure = (status: number, responseBody: string, retryAfter: string | null): DeliveryFailure => {
  const providerCode = firebaseErrorCode(responseBody);
  const invalidToken = providerCode === "UNREGISTERED"
    || providerCode === "registration-token-not-registered"
    || /registration-token-not-registered/i.test(responseBody);
  if (invalidToken) {
    return { code: "FCM_UNREGISTERED", disableDevice: true, retryable: false, retryAfterSeconds: null };
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
    return { code: `FCM_${status}`, disableDevice: false, retryable: true, retryAfterSeconds: null };
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
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 64) : null;
};

const remainingTtlSeconds = (delivery: ClaimedDelivery) => Math.max(
  0,
  Math.floor((Date.parse(delivery.expires_at) - Date.now()) / 1000),
);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID") || "";
  const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "";
  const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Ambiente Supabase incompleto." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: expectedSecret, error: secretError } = await admin.rpc("get_push_notification_worker_secret");
  if (secretError) return json({ error: "Executor indisponível." }, 500);
  const expectedSecretValue = typeof expectedSecret === "string" ? expectedSecret.trim() : "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expectedSecretValue || !bearer || !safeEqual(bearer, expectedSecretValue)) {
    return json({ error: "Não autorizado." }, 401);
  }
  if (!projectId || !clientEmail || !privateKey) {
    return json({ error: "Firebase Cloud Messaging ainda não foi configurado no executor." }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
  const workerId = `push:${crypto.randomUUID()}`;
  const regularQuota = Math.max(1, Math.ceil(limit / 2));
  const { data: claimed, error: claimError } = await admin.rpc("claim_push_notification_deliveries", {
    p_worker: workerId,
    p_limit: regularQuota,
  });
  if (claimError) return json({ error: "Não foi possível reservar as notificações." }, 500);

  const regularDeliveries = ((claimed || []) as Omit<ClaimedDelivery, "scope">[])
    .map((delivery) => ({ ...delivery, scope: "student" as const }));
  const publicQuota = Math.max(1, limit - regularDeliveries.length);
  const { data: claimedPublic, error: publicClaimError } = await admin.rpc("claim_public_support_push_deliveries", {
    p_worker: workerId,
    p_limit: publicQuota,
  });
  if (publicClaimError) return json({ error: "Não foi possível reservar as notificações públicas." }, 500);
  const publicDeliveries = ((claimedPublic || []) as Omit<ClaimedDelivery, "scope">[])
    .map((delivery) => ({ ...delivery, scope: "public_support" as const }));
  const deliveries: ClaimedDelivery[] = [...regularDeliveries, ...publicDeliveries];
  if (deliveries.length === 0) return json({ ok: true, claimed: 0, sent: 0, failed: 0 });

  let accessToken: string;
  try {
    accessToken = await firebaseAccessToken(clientEmail, privateKey);
  } catch (error) {
    console.error("push dispatcher firebase auth failed", error);
    return json({ error: "Falha de autenticação no Firebase.", claimed: deliveries.length }, 503);
  }

  let sent = 0;
  let failed = 0;
  const deliver = async (delivery: ClaimedDelivery) => {
    let success = false;
    let providerMessageId: string | null = null;
    let publicError: string | null = null;
    let disableDevice = false;
    let retryable = false;
    let retryDelaySeconds: number | null = null;
    try {
      const group = collapseKey(delivery);
      const urgent = isUrgent(delivery.category);
      const ttlSeconds = remainingTtlSeconds(delivery);
      if (ttlSeconds <= 0) {
        throw new Error("Push delivery expired before dispatch.");
      }
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: delivery.push_token,
              notification: { title: delivery.title, body: delivery.body },
              data: stringData(delivery.data, delivery.deep_link),
              android: {
                priority: urgent ? "high" : "normal",
                ttl: `${ttlSeconds}s`,
                ...(group ? { collapse_key: group } : {}),
                notification: { channel_id: androidChannel(delivery.category), sound: "default" },
              },
              apns: {
                headers: {
                  "apns-priority": urgent ? "10" : "5",
                  "apns-expiration": String(Math.floor(Date.now() / 1000) + ttlSeconds),
                  ...(group ? { "apns-collapse-id": group } : {}),
                },
                payload: { aps: { sound: "default" } },
              },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      const responseText = await response.text();
      success = response.ok;
      if (success) {
        providerMessageId = String(JSON.parse(responseText || "{}").name || "") || null;
        sent += 1;
      } else {
        const failure = classifyFailure(response.status, responseText, response.headers.get("Retry-After"));
        disableDevice = failure.disableDevice;
        retryable = failure.retryable;
        retryDelaySeconds = failure.retryAfterSeconds;
        publicError = failure.code;
        failed += 1;
        console.error("push delivery failed", { deliveryId: delivery.delivery_id, status: response.status });
      }
    } catch (error) {
      const expired = remainingTtlSeconds(delivery) <= 0;
      publicError = expired ? "PUSH_EXPIRED" : "FCM_NETWORK_ERROR";
      retryable = !expired;
      failed += 1;
      console.error("push delivery network failure", { deliveryId: delivery.delivery_id, error });
    }

    const completionRpc = delivery.scope === "public_support"
      ? "complete_public_support_push_delivery"
      : "complete_push_notification_delivery_v2";
    const { error: completeError } = await admin.rpc(completionRpc, {
      p_delivery_id: delivery.delivery_id,
      p_worker: workerId,
      p_success: success,
      p_provider_message_id: providerMessageId,
      p_error: publicError,
      p_disable_device: disableDevice,
      p_retryable: retryable,
      p_retry_after_seconds: retryDelaySeconds,
    });
    if (completeError) console.error("push delivery audit failure", { deliveryId: delivery.delivery_id });
  };

  const concurrency = 8;
  for (let offset = 0; offset < deliveries.length; offset += concurrency) {
    await Promise.all(deliveries.slice(offset, offset + concurrency).map(deliver));
  }

  return json({ ok: true, claimed: deliveries.length, sent, failed });
});
