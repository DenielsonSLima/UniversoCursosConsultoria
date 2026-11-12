import assert from "node:assert/strict";
import { handleCorrectPartnerEmail, type CorrectPartnerEmailOptions } from "./correct-partner-email.ts";
import { deliverCorrectedPartnerEmail } from "./correct-partner-email-delivery.ts";
import type { HandlerContext, Partner } from "../types.ts";

const ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  partner: "22222222-2222-4222-8222-222222222222",
  user: "33333333-3333-4333-8333-333333333333",
  request: "44444444-4444-4444-8444-444444444444",
  nonce: "55555555-5555-4555-8555-555555555555",
};
const partner: Partner = { id: ids.partner, tipo: "Aluno", nome: "Pessoa sintética" };
const fixture = (settings: {
  core?: Record<string, unknown>; coreError?: string; coreThrow?: boolean;
  claim?: Record<string, unknown>; claimError?: string; claimThrow?: boolean;
  finishError?: boolean; delivery?: "sent" | "failed" | "unknown" | "throw";
} = {}) => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const deliveries: Array<{ email: string; redirectTo: string }> = [];
  const context: HandlerContext = {
    admin: {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === "portal_correct_partner_email_internal") {
          if (settings.coreThrow) throw new Error("transport contains private detail");
          return Promise.resolve({ data: { userId: ids.user, email: "novo@example.com", emailCorrected: true,
            loginEmailChanged: true, emailSent: false, ...settings.core },
          error: settings.coreError ? { code: settings.coreError, message: "private detail" } : null });
        }
        if (args.p_action === "CLAIM") {
          if (settings.claimThrow) throw new Error("transport contains private detail");
          return Promise.resolve({ data: { claimed: true, userId: ids.user, email: "novo@example.com",
            deliveryNonce: ids.nonce, ...settings.claim },
          error: settings.claimError ? { code: settings.claimError, message: "private detail" } : null });
        }
        assert.equal(args.p_action, "FINISH");
        return Promise.resolve({ data: { emailSent: args.p_sent }, error: settings.finishError ? { code: "40001" } : null });
      },
    },
    gestor: { auth_user_id: ids.actor }, gestorEmail: "gestor@example.com",
    json: (payload, status = 200) => new Response(JSON.stringify(payload), { status }),
  };
  const options: CorrectPartnerEmailOptions = {
    requestId: ids.request, email: " Novo@Example.com ", expectedEmail: " Antigo@Example.com ",
    expectedAuthUserId: ids.user, expectedAuthEmail: " Antigo@Example.com ",
    supabaseUrl: "https://synthetic.supabase.co", publicApiKey: { apiKey: "public-fixture", message: null },
    deliver: async (email, redirectTo) => {
      deliveries.push({ email, redirectTo });
      if (settings.delivery === "throw") throw new Error("SMTP private detail");
      return { sent: !settings.delivery || settings.delivery === "sent", definitiveFailure: settings.delivery === "failed" };
    },
  };
  return { context, calls, deliveries, options };
};

Deno.test("correction uses canonical CAS/UID and only the claimed destination, with explicit student recovery audience", async () => {
  const f = fixture();
  const response = await handleCorrectPartnerEmail(f.context, partner, f.options);
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.emailSent, true); assert.equal(body.deliveryPending, false);
  assert.equal(body.emailCorrected, true); assert.equal(body.loginEmailChanged, true); assert.equal(body.userId, ids.user);
  assert.match(body.message, /serviço aceitou o envio/);
  assert.deepEqual(f.calls[0], { name: "portal_correct_partner_email_internal", args: {
    p_actor_auth_user_id: ids.actor, p_partner_id: ids.partner, p_request_id: ids.request,
    p_email: "novo@example.com", p_expected_email: "antigo@example.com", p_expected_auth_user_id: ids.user,
    p_expected_auth_email: "antigo@example.com",
  } });
  assert.deepEqual(f.deliveries, [{ email: "novo@example.com", redirectTo: "https://universocc.com.br/recuperar-senha?source=aluno" }]);
  assert.equal(f.calls[2].args.p_delivery_nonce, ids.nonce);
  assert.equal(f.calls[2].args.p_sent, true);
});

Deno.test("Professor default and allowed redirect overrides always retain institutional recovery audience", async () => {
  for (const redirectTo of [undefined, "https://universocc.com.br/login?source=aluno#old", "/recuperar-senha?source=aluno"]) {
    const f = fixture();
    await handleCorrectPartnerEmail(f.context, { ...partner, tipo: "Professor" }, { ...f.options, redirectTo });
    assert.deepEqual(f.deliveries, [{ email: "novo@example.com", redirectTo: "https://universocc.com.br/recuperar-senha?source=institucional" }]);
  }
  const f = fixture();
  assert.equal((await handleCorrectPartnerEmail(f.context, partner, { ...f.options, redirectTo: "https://untrusted.example/" })).status, 400);
  assert.equal(f.calls.length, 0);
});

Deno.test("sent replay and missing delivery configuration never rotate tokens or request another recovery email", async () => {
  const replay = fixture({ core: { emailSent: true } });
  assert.equal((await (await handleCorrectPartnerEmail(replay.context, partner, replay.options)).json()).deliveryPending, false);
  assert.equal(replay.calls.length, 1); assert.equal(replay.deliveries.length, 0);
  const noKey = fixture();
  const body = await (await handleCorrectPartnerEmail(noKey.context, partner, {
    ...noKey.options, publicApiKey: { apiKey: null, message: "not configured" },
  })).json();
  assert.equal(body.success, true); assert.equal(body.emailCorrected, true); assert.equal(body.deliveryPending, true);
  assert.equal(noKey.calls.length, 1); assert.equal(noKey.deliveries.length, 0);
});

Deno.test("all post-commit failures preserve truthful successful correction and pending delivery", async () => {
  for (const settings of [ { claimError: "40001" }, { claimThrow: true },
    { claim: { userId: ids.actor } }, { claim: { email: "someone-else@example.com" } },
    { claim: { deliveryNonce: "invalid" } },
  ]) {
    const f = fixture(settings);
    const response = await handleCorrectPartnerEmail(f.context, partner, f.options);
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.success, true); assert.equal(body.emailCorrected, true);
    assert.equal(body.deliveryPending, true); assert.equal(body.emailSent, false); assert.equal(f.deliveries.length, 0);
    assert(!JSON.stringify(body).includes("private detail"));
  }
  for (const settings of [{ delivery: "unknown" as const }, { delivery: "failed" as const }, { delivery: "throw" as const }]) {
    const f = fixture(settings);
    const body = await (await handleCorrectPartnerEmail(f.context, partner, f.options)).json();
    assert.equal(body.success, true); assert.equal(body.emailSent, false); assert.equal(body.deliveryPending, true);
    assert.equal(body.retryAfterSeconds, 120); assert.equal(f.calls[2].args.p_sent, false);
  }
  const f = fixture({ finishError: true });
  const body = await (await handleCorrectPartnerEmail(f.context, partner, f.options)).json();
  assert.equal(body.emailSent, true); assert.equal(body.deliveryPending, true);
});

Deno.test("active lease returns cooldown without dispatch; invalid input and denied core never send", async () => {
  const busy = fixture({ claim: { claimed: false, emailSent: false, deliveryPending: true, retryAfterSeconds: 87 } });
  const body = await (await handleCorrectPartnerEmail(busy.context, partner, busy.options)).json();
  assert.equal(body.retryAfterSeconds, 87); assert.equal(body.deliveryPending, true);
  assert.equal(busy.calls.length, 2); assert.equal(busy.deliveries.length, 0);
  for (const [code, status] of [["42501",403], ["40001",409], ["55000",409], ["22023",400]] as const) {
    const f = fixture({ coreError: code });
    assert.equal((await handleCorrectPartnerEmail(f.context, partner, f.options)).status, status);
    assert.equal(f.calls.length, 1); assert.equal(f.deliveries.length, 0);
  }
  const invalid = fixture();
  assert.equal((await handleCorrectPartnerEmail(invalid.context, partner, { ...invalid.options, email: "fake@acesso.universocc.invalid" })).status, 400);
  assert.equal(invalid.calls.length, 0);
});

Deno.test("delivery helper classifies acknowledgement and unknown transport without exposing links", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, result] of [[200,{ sent: true, definitiveFailure: false }],
      [429,{ sent: false, definitiveFailure: true }], [503,{ sent: false, definitiveFailure: false }]] as const) {
      globalThis.fetch = (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://synthetic.supabase.co"); assert.equal(url.pathname, "/auth/v1/recover");
        assert.equal(url.searchParams.get("redirect_to"), "https://universocc.com.br/recuperar-senha?source=aluno");
        assert.deepEqual(JSON.parse(String(init?.body)), { email: "novo@example.com" });
        return Promise.resolve(new Response(null, { status }));
      };
      assert.deepEqual(await deliverCorrectedPartnerEmail("https://synthetic.supabase.co/", "public-fixture", "novo@example.com",
        "https://universocc.com.br/recuperar-senha?source=aluno"), result);
    }
    globalThis.fetch = () => Promise.reject(new Error("network acknowledgement lost"));
    assert.deepEqual(await deliverCorrectedPartnerEmail("https://synthetic.supabase.co", "public-fixture", "novo@example.com",
      "https://universocc.com.br/recuperar-senha?source=aluno"), { sent: false, definitiveFailure: false });
  } finally { globalThis.fetch = originalFetch; }
});
