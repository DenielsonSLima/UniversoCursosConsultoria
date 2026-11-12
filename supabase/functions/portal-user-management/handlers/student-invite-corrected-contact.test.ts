import assert from "node:assert/strict";
import { handleSendStudentInvite } from "./send-student-invite.ts";
import {
  basePartner,
  contextFor,
  makeAdmin,
  options,
} from "./send-student-invite.fixture.ts";

for (const authEmail of [
  "email-digitado-errado@example.com",
  "matricula@acesso.universocc.invalid",
]) {
  Deno.test(`contato corrigido não é tratado como entrega ao login ${authEmail}`, async () => {
    const authUser = { id: "auth-original", email: authEmail };
    const fixture = makeAdmin([authUser]);
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      throw new Error("Este teste não permite enviar e-mail ou fazer rede.");
    }) as typeof fetch;

    try {
      const response = await handleSendStudentInvite(
        contextFor(fixture.admin),
        {
          ...basePartner,
          email: "email-corrigido@example.com",
          auth_login_email: authEmail,
          auth_user_id: authUser.id,
          acesso_status: "pendente",
        },
        options,
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.userId, authUser.id);
      assert.equal(body.inviteSent, false);
      assert.equal(body.recoveryEmailSent, false);
      assert.equal(body.recoveryLink, "https://example.test/link");
      assert.match(body.message, /contato.*difer|contato.*não.*coincide/i);
      assert.match(body.message, /nenhum.*e-mail.*enviado|não.*enviad.*e-mail/i);
      assert.match(body.message, /canal.*verificado/i);
      assert.doesNotMatch(body.message, /aluno sem e-mail/i);
      assert.equal(fetchCalls, 0);
      assert.deepEqual(fixture.counts(), {
        inviteCalls: 0,
        createCalls: 0,
        generateLinkCalls: 1,
      });
      assert.equal(
        fixture.updates.some((patch) =>
          "email" in patch ||
          ("auth_login_email" in patch && patch.auth_login_email !== authEmail) ||
          ("auth_user_id" in patch && patch.auth_user_id !== authUser.id)
        ),
        false,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

Deno.test("aluno sem contato mantém orientação de entrega manual", async () => {
  const authUser = {
    id: "auth-original",
    email: "matricula@acesso.universocc.invalid",
  };
  const fixture = makeAdmin([authUser]);
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    {
      ...basePartner,
      email: null,
      auth_login_email: authUser.email,
      auth_user_id: authUser.id,
    },
    options,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.recoveryEmailSent, false);
  assert.equal(body.recoveryLink, "https://example.test/link");
  assert.match(body.message, /aluno sem e-mail/i);
  assert.match(body.message, /canal.*verificado/i);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    createCalls: 0,
    generateLinkCalls: 1,
  });
});
