import type { PhoneNumberStatus, SyncRequestResult } from "./types.ts";
import { asRecord, getNestedText, trimOrNull } from "./utils.ts";

export const GRAPH_BASE_URL = "https://graph.facebook.com";
export const COEXISTENCE_FINISH_EVENT = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
export const BUSINESS_APP_SYNC_TYPES = ["smb_app_state_sync", "history"] as const;

type MetaPayload = Record<string, unknown>;

const authHeaders = (accessToken: string) => ({
  "Authorization": `Bearer ${accessToken}`,
});

const metaErrorMessage = (payload: MetaPayload, fallback: string) => {
  const error = asRecord(payload.error);
  return trimOrNull(error.message) || trimOrNull(error.error_user_msg) || fallback;
};

export const parseMetaResponse = async <T extends MetaPayload = MetaPayload>(
  response: Response,
  fallback: string,
): Promise<T> => {
  const payload = await response.json().catch(() => ({})) as MetaPayload;
  if (!response.ok) {
    throw new Error(metaErrorMessage(payload, fallback));
  }
  return payload as T;
};

export const exchangeEmbeddedSignupCode = async ({
  graphVersion,
  appId,
  appSecret,
  code,
}: {
  graphVersion: string;
  appId: string;
  appSecret: string;
  code: string;
}) => {
  const tokenUrl = new URL(`${GRAPH_BASE_URL}/${graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("code", code);

  const tokenResponse = await fetch(tokenUrl.toString());
  const tokenPayload = await parseMetaResponse(tokenResponse, "Falha ao trocar codigo do Embedded Signup.");
  const accessToken = trimOrNull(tokenPayload.access_token);
  if (!accessToken) throw new Error("A Meta nao retornou access token para o Embedded Signup.");

  return accessToken;
};

export const fetchFirstPhoneNumberId = async ({
  graphVersion,
  wabaId,
  accessToken,
}: {
  graphVersion: string;
  wabaId: string;
  accessToken: string;
}) => {
  const phonesResponse = await fetch(
    `${GRAPH_BASE_URL}/${graphVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
    { headers: authHeaders(accessToken) },
  );
  const phonesPayload = await parseMetaResponse(phonesResponse, "Falha ao buscar Phone Number ID da WABA.");
  const phones = Array.isArray(phonesPayload.data) ? phonesPayload.data : [];
  return getNestedText(asRecord(phones[0]), "id");
};

export const fetchPhoneNumberStatus = async ({
  graphVersion,
  phoneNumberId,
  accessToken,
}: {
  graphVersion: string;
  phoneNumberId: string;
  accessToken: string;
}) => {
  const statusResponse = await fetch(
    `${GRAPH_BASE_URL}/${graphVersion}/${phoneNumberId}?fields=is_on_biz_app,platform_type,display_phone_number,quality_rating`,
    { headers: authHeaders(accessToken) },
  );
  return await parseMetaResponse<PhoneNumberStatus>(statusResponse, "Falha ao consultar status do numero WhatsApp.");
};

export const subscribeWabaToWebhooks = async ({
  graphVersion,
  wabaId,
  accessToken,
}: {
  graphVersion: string;
  wabaId: string;
  accessToken: string;
}) => {
  const subscribeResponse = await fetch(`${GRAPH_BASE_URL}/${graphVersion}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  await parseMetaResponse(subscribeResponse, "Falha ao assinar webhooks da WABA.");
};

export const startBusinessAppSync = async ({
  graphVersion,
  phoneNumberId,
  accessToken,
  syncType,
}: {
  graphVersion: string;
  phoneNumberId: string;
  accessToken: string;
  syncType: string;
}): Promise<SyncRequestResult> => {
  const syncResponse = await fetch(`${GRAPH_BASE_URL}/${graphVersion}/${phoneNumberId}/smb_app_data`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      sync_type: syncType,
    }),
  });
  const syncPayload = await parseMetaResponse(syncResponse, `Falha ao iniciar sincronizacao ${syncType}.`);
  return {
    syncType,
    requestId: trimOrNull(syncPayload.request_id),
  };
};
