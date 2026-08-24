import assert from "node:assert/strict";
import {
  handleEnsureResponsavelAccess,
  INVITE_RECONCILIATION_PROOF_RPC,
} from "./ensure-responsavel-access.ts";
import {
  ACTOR_ID,
  AUTH_ID,
  EMAIL,
  makeFixture,
  OTHER_ACTOR_ID,
  OTHER_REQUEST_ID,
  REQUEST_ID,
  RESPONSAVEL_ID,
} from "./ensure-responsavel-access.test-fixture.ts";

Deno.test("permite que outro gestor autorizado reconcilie o convite assinado", async () => {
  const failedAttempt = makeFixture({
    bindingError: { code: "40001", message: "Estado alterado." },
  });
  await handleEnsureResponsavelAccess(
    failedAttempt.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const invitationMetadata = failedAttempt.invitePayloads[0]
    .data as Record<string, unknown>;
  const retry = makeFixture({
    actorAuthUserId: OTHER_ACTOR_ID,
    authUsers: [{
      id: AUTH_ID,
      email: EMAIL,
      user_metadata: invitationMetadata,
    }],
  });
  const response = await handleEnsureResponsavelAccess(
    retry.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinked, true);
  assert.equal(body.inviteSent, false);
  assert.equal(retry.rpcCalls.length, 3);
  assert.equal(retry.rpcCalls[1].name, INVITE_RECONCILIATION_PROOF_RPC);
  assert.equal(
    retry.rpcCalls[1].args.p_current_actor_auth_user_id,
    OTHER_ACTOR_ID,
  );
  assert.equal(
    retry.rpcCalls[1].args.p_original_actor_auth_user_id,
    ACTOR_ID,
  );
  assert.equal(retry.rpcCalls[2].args.p_actor_auth_user_id, OTHER_ACTOR_ID);
  assert.equal(retry.invitePayloads.length, 0);
});

Deno.test("rejeita adulteração do ator original ou nonce assinado", async () => {
  const failedAttempt = makeFixture({
    bindingError: { code: "40001", message: "Estado alterado." },
  });
  await handleEnsureResponsavelAccess(
    failedAttempt.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const originalMetadata = failedAttempt.invitePayloads[0]
    .data as Record<string, unknown>;

  for (
    const alteredMetadata of [
      { ...originalMetadata, invite_operation_actor: OTHER_ACTOR_ID },
      { ...originalMetadata, invite_operation_nonce: OTHER_REQUEST_ID },
    ]
  ) {
    const retry = makeFixture({
      authUsers: [{
        id: AUTH_ID,
        email: EMAIL,
        user_metadata: alteredMetadata,
      }],
    });
    const response = await handleEnsureResponsavelAccess(
      retry.context,
      RESPONSAVEL_ID,
      OTHER_REQUEST_ID,
    );
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /marcador seguro/i);
    assert.equal(retry.rpcCalls.length, 2);
    assert.equal(retry.invitePayloads.length, 0);
  }
});
