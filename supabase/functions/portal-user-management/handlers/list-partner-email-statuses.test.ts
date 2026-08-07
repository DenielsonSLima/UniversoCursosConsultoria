import assert from "node:assert/strict";
import { handleListPartnerEmailStatuses } from "./list-partner-email-statuses.ts";
import type { HandlerContext } from "../types.ts";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const P4 = "44444444-4444-4444-8444-444444444444";

const partners = [
  {
    id: P1,
    tipo: "Aluno",
    email: "contato-1@example.com",
    auth_user_id: "auth-by-id",
    auth_login_email: "login-antigo@example.com",
    polo_id: null,
    polo_ids: [],
  },
  {
    id: P2,
    tipo: "Aluno",
    email: "contato-2@example.com",
    auth_user_id: null,
    auth_login_email: "login-canonico@example.com",
    polo_id: null,
    polo_ids: [],
  },
  {
    id: P3,
    tipo: "Aluno",
    email: "contato-3@example.com",
    auth_user_id: "auth-inexistente",
    auth_login_email: "login-com-fallback@example.com",
    polo_id: null,
    polo_ids: [],
  },
  {
    id: P4,
    tipo: "Aluno",
    email: null,
    auth_user_id: "auth-sintetico",
    auth_login_email: "matricula@acesso.universocc.invalid",
    polo_id: null,
    polo_ids: [],
  },
];

const authUsers = [
  {
    id: "auth-by-id",
    email: "outro-login@example.com",
    email_confirmed_at: "2026-08-03T12:00:00.000Z",
  },
  { id: "auth-email-nao-canonico", email: "login-antigo@example.com" },
  {
    id: "auth-by-email",
    email: "login-canonico@example.com",
    confirmed_at: "2026-08-03T12:00:00.000Z",
  },
  {
    id: "auth-fallback-proibido",
    email: "login-com-fallback@example.com",
    confirmed_at: "2026-08-03T12:00:00.000Z",
  },
  {
    id: "auth-sintetico",
    email: "matricula@acesso.universocc.invalid",
    confirmed_at: "2026-08-03T12:00:00.000Z",
  },
];

const admin = {
  from: () => ({
    select: () => ({
      in: async () => ({ data: partners, error: null }),
    }),
  }),
  auth: {
    admin: {
      listUsers: async () => ({ data: { users: authUsers }, error: null }),
    },
  },
};

const context: HandlerContext = {
  admin,
  gestor: {
    context: "global",
    polo_ids: [],
    permissoes: { allPolos: true },
  },
  gestorEmail: "gestor@example.com",
  json: (payload, status = 200) =>
    new Response(JSON.stringify(payload), { status }),
};

Deno.test("status prioriza auth_user_id, usa login canônico e não faz fallback inseguro", async () => {
  const response = await handleListPartnerEmailStatuses(
    context,
    [P1, P2, P3, P4],
  );
  const body = await response.json();
  const statuses = new Map<string, any>(
    body.statuses.map((item: any) => [item.partnerId, item]),
  );

  assert.equal(response.status, 200);
  assert.equal(statuses.get(P1).status, "confirmed");
  assert.equal(statuses.get(P2).status, "confirmed");
  assert.equal(statuses.get(P3).status, "no_auth_user");
  assert.equal(statuses.get(P3).authUserExists, false);
  assert.equal(statuses.get(P4).status, "no_email");
  assert.equal(statuses.get(P4).authUserExists, true);
});
