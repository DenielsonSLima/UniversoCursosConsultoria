import assert from "node:assert/strict";
import {
  buildFirebaseMessage,
  canonicalPushImagePath,
  type ClaimedDelivery,
  processClaimedPushAssetCleanups,
  publicPushImageUrl,
  pushConsentFailureCode,
  requiredPushConsentPurpose,
} from "./index.ts";

const delivery = (
  overrides: Partial<ClaimedDelivery> = {},
): ClaimedDelivery => ({
  scope: "student",
  delivery_id: "11111111-1111-4111-8111-111111111111",
  job_id: "22222222-2222-4222-8222-222222222222",
  campaign_id: "33333333-3333-4333-8333-333333333333",
  device_id: "44444444-4444-4444-8444-444444444444",
  push_token: "fcm-token",
  platform: "android",
  category: "marketing",
  title: "Feliz aniversário!",
  body: "A Universo deseja um dia muito especial.",
  deep_link: "/aluno/?module=notificacoes",
  data: {
    imagePath: "birthday/55555555-5555-4555-8555-555555555555.png",
    collapse_key: "birthday:student:2026",
  },
  expires_at: "2026-08-05T12:00:00.000Z",
  ...overrides,
});

Deno.test("aceita apenas o caminho canônico do bucket de imagens push", () => {
  const canonical = "campaigns/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
  assert.equal(canonicalPushImagePath(canonical), canonical);
  assert.equal(canonicalPushImagePath(` ${canonical}`), null);
  assert.equal(canonicalPushImagePath("campaigns/../../secret.png"), null);
  assert.equal(canonicalPushImagePath("whatsapp/aniversario.png"), null);
  assert.equal(
    canonicalPushImagePath("birthday/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg"),
    null,
  );
  assert.equal(canonicalPushImagePath("https://example.com/image.png"), null);
  assert.equal(
    publicPushImageUrl("http://localhost:54321", canonical),
    null,
    "imagem remota do push deve exigir HTTPS",
  );
});

Deno.test("monta payload rico Android e APNs usando somente a URL pública canônica", () => {
  const message = buildFirebaseMessage(
    delivery({
      data: {
        imagePath: "birthday/55555555-5555-4555-8555-555555555555.png",
        image_url: "https://attacker.example/image.png",
        collapse_key: "birthday:student:2026",
      },
    }),
    "66666666-6666-4666-8666-666666666666",
    "https://project.supabase.co/",
    3600,
    1_700_000_000,
  );
  const expectedImage =
    "https://project.supabase.co/storage/v1/object/public/push-notification-images/birthday/55555555-5555-4555-8555-555555555555.png";

  assert.equal(message.notification.image, expectedImage);
  assert.equal(message.android.notification.image, expectedImage);
  assert.equal(message.apns.payload.aps["mutable-content"], 1);
  assert.equal(message.apns.fcm_options?.image, expectedImage);
  assert.equal(message.data.image_url, expectedImage);
  assert.equal(message.data.imagePath, undefined);
  assert.equal(
    message.data.notificationId,
    "66666666-6666-4666-8666-666666666666",
  );
  assert.equal(message.apns.headers["apns-expiration"], "1700003600");
});

Deno.test("mantém payload textual quando imagePath é ausente ou inválido", () => {
  const message = buildFirebaseMessage(
    delivery({
      category: "institutional",
      data: {
        imagePath: "https://attacker.example/image.png",
        image_url: "https://attacker.example/also-invalid.png",
      },
    }),
    null,
    "https://project.supabase.co",
    1800,
    1_700_000_000,
  );

  assert.equal("image" in message.notification, false);
  assert.equal("image" in message.android.notification, false);
  assert.equal("mutable-content" in message.apns.payload.aps, false);
  assert.equal("fcm_options" in message.apns, false);
  assert.equal("image_url" in message.data, false);
  assert.equal("imagePath" in message.data, false);
  assert.equal(
    message.notification.body,
    "A Universo deseja um dia muito especial.",
  );
});

Deno.test("consentimentos de relacionamento e marketing comercial são independentes e falham fechados", () => {
  const commercial = delivery({ data: {} });
  assert.equal(requiredPushConsentPurpose(commercial), "commercial_marketing");
  assert.equal(
    pushConsentFailureCode(commercial, {
      available: true,
      allowedDeliveryIds: new Set(),
    }),
    "PUSH_COMMERCIAL_MARKETING_CONSENT_REQUIRED",
  );
  assert.equal(
    pushConsentFailureCode(commercial, {
      available: false,
      allowedDeliveryIds: new Set(),
    }),
    "PUSH_CONSENT_CHECK_FAILED",
  );
  assert.equal(
    pushConsentFailureCode(commercial, {
      available: true,
      allowedDeliveryIds: new Set([commercial.delivery_id]),
    }),
    null,
  );
  assert.equal(
    pushConsentFailureCode(
      delivery({ category: "institutional" }),
      { available: false, allowedDeliveryIds: new Set() },
    ),
    null,
  );
  const legacyBirthday = delivery({
    category: "institutional",
    data: { event: "birthday" },
  });
  assert.equal(requiredPushConsentPurpose(legacyBirthday), "relationship_birthday");
  assert.equal(
    pushConsentFailureCode(legacyBirthday, {
      available: true,
      allowedDeliveryIds: new Set(),
    }),
    "PUSH_RELATIONSHIP_BIRTHDAY_CONSENT_REQUIRED",
  );
});

Deno.test("parâmetro de auditoria do provedor aparece uma única vez", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assert.equal(source.match(/p_provider_message_id:/g)?.length, 1);
  assert.match(
    source,
    /\.rpc\(\s*"push_notification_consent_allowed_deliveries"/,
    "o dispatcher deve consultar a decisão canônica de consentimento no banco",
  );
  assert.doesNotMatch(source, /push-marketing-v1/);
});

Deno.test("cleanup revalida por RPC antes de remover e confirma sucesso", async () => {
  const calls: string[] = [];
  const cleanup = {
    cleanup_id: "77777777-7777-4777-8777-777777777777",
    asset_id: "88888888-8888-4888-8888-888888888888",
    bucket_id: "push-notification-images",
    object_path: "campaigns/88888888-8888-4888-8888-888888888888.jpg",
  };
  const result = await processClaimedPushAssetCleanups(
    [cleanup],
    "asset-cleanup:test",
    {
      revalidate: async () => {
        calls.push("revalidate");
        return {
          eligible: true,
          bucketId: cleanup.bucket_id,
          objectPath: cleanup.object_path,
        };
      },
      remove: async () => {
        calls.push("remove");
        return { ok: true };
      },
      complete: async (_cleanup, _worker, success, error) => {
        calls.push(`complete:${success}:${error}`);
        return true;
      },
    },
  );

  assert.deepEqual(calls, ["revalidate", "remove", "complete:true:null"]);
  assert.deepEqual(result, {
    claimed: 1,
    deleted: 1,
    failed: 0,
    auditFailed: 0,
    claimFailed: false,
  });
});

Deno.test("cleanup nunca remove quando a revalidação rejeita ou altera o caminho", async () => {
  let removeCalls = 0;
  const completions: Array<{ success: boolean; error: string | null }> = [];
  const base = {
    asset_id: "99999999-9999-4999-8999-999999999999",
    bucket_id: "push-notification-images",
    object_path: "birthday/99999999-9999-4999-8999-999999999999.png",
  };
  const result = await processClaimedPushAssetCleanups(
    [
      { ...base, cleanup_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { ...base, cleanup_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    ],
    "asset-cleanup:test",
    {
      revalidate: async (cleanup) =>
        cleanup.cleanup_id.startsWith("a")
          ? { eligible: false, reason: "ASSET_BECAME_REFERENCED" }
          : {
            eligible: true,
            bucketId: base.bucket_id,
            objectPath: "birthday/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png",
          },
      remove: async () => {
        removeCalls += 1;
        return { ok: true };
      },
      complete: async (_cleanup, _worker, success, error) => {
        completions.push({ success, error });
        return true;
      },
    },
  );

  assert.equal(removeCalls, 0);
  assert.deepEqual(completions, [
    { success: false, error: "ASSET_BECAME_REFERENCED" },
    { success: false, error: "ASSET_CLEANUP_REVALIDATION_REJECTED" },
  ]);
  assert.equal(result.failed, 2);
  assert.equal(result.auditFailed, 0);
});

Deno.test("falha do Storage é persistida para retry pela conclusão", async () => {
  let completion: { success: boolean; error: string | null } | null = null;
  const cleanup = {
    cleanup_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    asset_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    bucket_id: "push-notification-images",
    object_path: "campaigns/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.jpg",
  };
  const result = await processClaimedPushAssetCleanups(
    [cleanup],
    "asset-cleanup:test",
    {
      revalidate: async () => ({
        eligible: true,
        bucketId: cleanup.bucket_id,
        objectPath: cleanup.object_path,
      }),
      remove: async () => ({ ok: false, error: "STORAGE_DELETE_FAILED" }),
      complete: async (_cleanup, _worker, success, error) => {
        completion = { success, error };
        return true;
      },
    },
  );

  assert.deepEqual(completion, {
    success: false,
    error: "STORAGE_DELETE_FAILED",
  });
  assert.equal(result.deleted, 0);
  assert.equal(result.failed, 1);
});
