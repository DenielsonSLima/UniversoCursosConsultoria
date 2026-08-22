import assert from "node:assert/strict";
import {
  buildGestorInviteOperationMetadata,
  hasValidGestorInviteOperationMarker,
  isLegacyPendingGestorInvite,
} from "./gestor-invite-reconciliation.ts";

const CURRENT_ACTOR = "d897ffc3-6bb6-4299-b406-e4ebb015314e";
const OTHER_ACTOR = "8cf14429-c917-48fc-ba1d-ae3e049a45d4";
const REQUEST_ID = "e1c540a6-8bd3-4a30-9bd8-a5fc9df70b12";
const OTHER_REQUEST_ID = "de9260e8-9829-4765-84a0-6dbed15906e5";
const EMAIL = "gestora@example.com";
const CPF = "123.456.789-09";

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const makeContext = () => ({
  gestor: { auth_user_id: CURRENT_ACTOR },
  admin: {
    rpc: async (_name: string, args: Record<string, unknown>) => ({
      data: await sha256Hex(JSON.stringify(args)),
      error: null,
    }),
  },
});

Deno.test("aceita somente o marcador HMAC íntegro do convite de gestor", async () => {
  const context = makeContext() as any;
  const metadata = await buildGestorInviteOperationMetadata(
    context,
    REQUEST_ID,
    EMAIL,
    CPF,
    "Gestora Teste",
  );
  const authUser = { email: EMAIL, user_metadata: metadata };

  assert.equal(
    await hasValidGestorInviteOperationMarker(context, authUser, EMAIL, CPF),
    true,
  );
});

Deno.test("rejeita adulteração de proof, actor, nonce, e-mail ou CPF", async () => {
  const context = makeContext() as any;
  const metadata = await buildGestorInviteOperationMetadata(
    context,
    REQUEST_ID,
    EMAIL,
    CPF,
    "Gestora Teste",
  );
  const cases = [
    { ...metadata, invite_operation_proof: "b".repeat(64) },
    { ...metadata, invite_operation_actor: OTHER_ACTOR },
    { ...metadata, invite_operation_nonce: OTHER_REQUEST_ID },
    { ...metadata, cpf: "98765432100" },
    { ...metadata, origem: "outro_fluxo" },
  ];

  for (const tamperedMetadata of cases) {
    assert.equal(
      await hasValidGestorInviteOperationMarker(
        context,
        { email: EMAIL, user_metadata: tamperedMetadata },
        EMAIL,
        CPF,
      ),
      false,
    );
  }
  assert.equal(
    await hasValidGestorInviteOperationMarker(
      context,
      { email: "outra@example.com", user_metadata: metadata },
      EMAIL,
      CPF,
    ),
    false,
  );
});

Deno.test("compatibilidade legada exige convite pendente nunca confirmado ou usado", () => {
  const base = {
    email: EMAIL,
    invited_at: "2026-08-22T13:26:46.000Z",
    confirmed_at: null,
    email_confirmed_at: null,
    last_sign_in_at: null,
    user_metadata: {
      origem: "usuarios_sistema",
      invite_operation_nonce: REQUEST_ID,
    },
  };
  assert.equal(isLegacyPendingGestorInvite(base, EMAIL), true);
  assert.equal(
    isLegacyPendingGestorInvite({ ...base, confirmed_at: "2026-08-22" }, EMAIL),
    false,
  );
  assert.equal(
    isLegacyPendingGestorInvite(
      { ...base, last_sign_in_at: "2026-08-22" },
      EMAIL,
    ),
    false,
  );
  assert.equal(
    isLegacyPendingGestorInvite({ ...base, invited_at: null }, EMAIL),
    false,
  );
});
