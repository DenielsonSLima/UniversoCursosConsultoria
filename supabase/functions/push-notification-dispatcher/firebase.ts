import { publicPushImageUrl } from "./push-assets.ts";
import type { ClaimedDelivery, DeliveryFailure } from "./types.ts";

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

export const firebaseAccessToken = async (
  clientEmail: string,
  privateKey: string,
) => {
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

export const classifyFailure = (
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

export const remainingTtlSeconds = (delivery: ClaimedDelivery) =>
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
