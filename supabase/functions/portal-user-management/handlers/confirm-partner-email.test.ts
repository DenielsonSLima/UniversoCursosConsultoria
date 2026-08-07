import assert from "node:assert/strict";
import { handleConfirmPartnerEmail } from "./confirm-partner-email.ts";
import type { HandlerContext, Partner } from "../types.ts";

Deno.test("gestor não pode confirmar manualmente e-mail pendente", async () => {
  let updateUserCalls = 0;
  const context: HandlerContext = {
    admin: {
      auth: {
        admin: {
          listUsers: async () => ({
            data: {
              users: [{ id: "auth-1", email: "aluno@example.com" }],
            },
            error: null,
          }),
          updateUserById: async () => {
            updateUserCalls += 1;
            return { error: null };
          },
        },
      },
    },
    gestor: { id: "gestor-1" },
    gestorEmail: "gestor@example.com",
    json: (payload, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
  };
  const partner: Partner = {
    id: "partner-1",
    tipo: "Aluno",
    nome: "Aluno Teste",
    email: "aluno@example.com",
  };

  const response = await handleConfirmPartnerEmail(context, partner);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.emailConfirmed, false);
  assert.equal(updateUserCalls, 0);
});
