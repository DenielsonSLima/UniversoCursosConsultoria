import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireGestorAtivo, requireGestorGlobal, requireGestorTab } from "../_shared/authz.ts";
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from "../_shared/http.ts";

type BusinessProfile = {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profilePictureUrl?: string | null;
};

const trim = (value: unknown) => String(value || "").trim();

const allowedVerticals = new Set([
  "UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN", "EVENT_PLAN",
  "FINANCE", "GROCERY", "GOVT", "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES",
  "RETAIL", "TRAVEL", "RESTAURANT", "NOT_A_BIZ",
]);

const normalizeVertical = (value: unknown) => {
  const vertical = trim(value).toUpperCase();
  // Although Meta lists UNDEFINED in some responses, the profile update endpoint rejects it.
  return vertical && vertical !== "UNDEFINED" && allowedVerticals.has(vertical) ? vertical : "EDU";
};

const normalizeGraphVersion = (value: unknown) => {
  const version = trim(value) || "v23.0";
  return /^v\d+\.\d+$/.test(version) ? version : "v23.0";
};

const normalizeProfile = (profile: any): BusinessProfile => ({
  about: trim(profile?.about),
  address: trim(profile?.address),
  description: trim(profile?.description),
  email: trim(profile?.email),
  websites: Array.isArray(profile?.websites) ? profile.websites.map(trim).filter(Boolean).slice(0, 2) : [],
  vertical: normalizeVertical(profile?.vertical),
  profilePictureUrl: profile?.profile_picture_url || profile?.profilePictureUrl || null,
});

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const metaFetch = async (url: string, accessToken: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Falha ao comunicar com a Meta.");
  }
  return payload;
};

const getMetaContext = async (admin: any) => {
  const { data: config, error: configError } = await admin
    .from("mensageria_config")
    .select("wa_phone_number_id, wa_graph_version, wa_app_id")
    .eq("tipo", "whatsapp")
    .maybeSingle();
  if (configError) throw configError;

  const { data: accessTokenSecret, error: secretError } = await admin.rpc(
    "whatsapp_get_secret",
    { p_secret_name: "whatsapp_meta_access_token" },
  );
  if (secretError) throw secretError;

  const accessToken = trim(accessTokenSecret);
  const phoneNumberId = trim(config?.wa_phone_number_id);
  if (!accessToken || !phoneNumberId) {
    throw new Error("API WhatsApp nao configurada para editar perfil.");
  }

  return {
    accessToken,
    phoneNumberId,
    appId: trim(config?.wa_app_id),
    graphVersion: normalizeGraphVersion(config?.wa_graph_version),
  };
};

const readProfileFromMeta = async (context: Awaited<ReturnType<typeof getMetaContext>>) => {
  const fields = "about,address,description,email,profile_picture_url,websites,vertical";
  const url = `https://graph.facebook.com/${context.graphVersion}/${context.phoneNumberId}/whatsapp_business_profile?fields=${fields}`;
  const payload = await metaFetch(url, context.accessToken);
  return normalizeProfile(Array.isArray(payload?.data) ? payload.data[0] : payload);
};

const uploadProfilePhoto = async (
  context: Awaited<ReturnType<typeof getMetaContext>>,
  photo: { base64?: string; type?: string; name?: string },
) => {
  if (!context.appId) throw new Error("App ID da Meta obrigatorio para trocar a foto do perfil.");

  const mime = trim(photo.type) || "image/jpeg";
  if (!["image/jpeg", "image/png"].includes(mime)) throw new Error("A foto deve ser JPG ou PNG.");

  const bytes = decodeBase64(trim(photo.base64));
  if (bytes.byteLength <= 0) throw new Error("Arquivo de foto invalido.");
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("A foto deve ter no maximo 5 MB.");

  const fileName = encodeURIComponent(trim(photo.name) || "whatsapp-profile.jpg");
  const startUrl = `https://graph.facebook.com/${context.graphVersion}/${context.appId}/uploads?file_name=${fileName}&file_length=${bytes.byteLength}&file_type=${encodeURIComponent(mime)}`;
  const session = await metaFetch(startUrl, context.accessToken, { method: "POST" });
  const sessionId = trim(session?.id);
  if (!sessionId) throw new Error("A Meta nao retornou sessao de upload da foto.");

  const uploadHeaders = new Headers({
    Authorization: `OAuth ${context.accessToken}`,
    file_offset: "0",
    "Content-Type": "application/octet-stream",
  });
  const uploadResponse = await fetch(`https://graph.facebook.com/${context.graphVersion}/${sessionId}`, {
    method: "POST",
    headers: uploadHeaders,
    body: bytes,
  });
  const uploadPayload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    throw new Error(uploadPayload?.error?.message || "Falha ao enviar foto para a Meta.");
  }

  const handle = trim(uploadPayload?.h);
  if (!handle) throw new Error("A Meta nao retornou o identificador da foto.");
  return handle;
};

const saveProfileToMeta = async (
  context: Awaited<ReturnType<typeof getMetaContext>>,
  profile: BusinessProfile,
  photo?: { base64?: string; type?: string; name?: string } | null,
) => {
  const clean = normalizeProfile(profile);
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    vertical: clean.vertical,
  };

  // The test phone endpoint rejects empty optional fields with OAuth error #10.
  // Omit them so editing only the photo, category or website remains valid.
  if (clean.about) body.about = clean.about;
  if (clean.address) body.address = clean.address;
  if (clean.description) body.description = clean.description;
  if (clean.email) body.email = clean.email;
  if (clean.websites?.length) body.websites = clean.websites;

  if (photo?.base64) body.profile_picture_handle = await uploadProfilePhoto(context, photo);

  await metaFetch(
    `https://graph.facebook.com/${context.graphVersion}/${context.phoneNumberId}/whatsapp_business_profile`,
    context.accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return clean;
};

Deno.serve(async (req: Request) => {
  const respondJson = (body: unknown, status = 200) => json(body, status, req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  if (req.method !== "POST") return respondJson({ error: "Metodo nao permitido." }, 405);

  if (isRateLimitExceeded(`whatsapp-profile:${getClientIp(req)}`, 20, 60000)) {
    return respondJson({ error: "Muitas alteracoes em curto periodo. Aguarde alguns instantes." }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson({ error: "Ambiente Supabase incompleto para perfil WhatsApp." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireGestorTab(gestor, "comunicacao", "comunicacao-whatsapp");
    requireGestorGlobal(gestor);

    const body = await req.json();
    const context = await getMetaContext(admin);

    if (body?.action === "save") {
      const savedProfile = await saveProfileToMeta(context, body.profile || {}, body.photo || null);
      try {
        const profile = await readProfileFromMeta(context);
        return respondJson({ ok: true, profile });
      } catch (readError) {
        // Saving and reading the profile use different Meta permissions. Do not report a
        // successful update as failed only because the token cannot immediately read it back.
        console.warn("whatsapp-profile saved, but could not reload from Meta:", readError);
        return respondJson({
          ok: true,
          profile: {
            ...savedProfile,
            profilePictureUrl: body?.profile?.profilePictureUrl || null,
          },
          warning: "Perfil salvo, mas a Meta não permitiu recarregar os dados imediatamente.",
        });
      }
    }

    const profile = await readProfileFromMeta(context);
    return respondJson({ ok: true, profile });
  } catch (error) {
    console.error("whatsapp-profile error:", error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro inesperado no perfil WhatsApp.",
    }, 400);
  }
});
