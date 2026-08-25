import assert from "node:assert/strict";
import { handleSendStudentInvite } from "./send-student-invite.ts";
import type { HandlerContext, Partner } from "../types.ts";

const RAW_FAILURE = "db-host.internal token=segredo-operacional";
const partner: Partner = {
  id: "22222222-2222-4222-8222-222222222222",
  tipo: "Aluno",
  nome: "Aluno Teste",
  status: "ATIVO",
  email: "aluno@example.com",
  auth_login_email: "aluno@example.com",
  cpf_cnpj: "52998224725",
};

type FailureMode = "throw-list" | "processing-db" | "invite-result";

const makeContext = (mode: FailureMode) => {
  let updateCalls = 0;
  const admin = {
    rpc: () => ({ data: "a".repeat(64), error: null }),
    from: () => ({
      update: () => ({
        eq: () => {
          updateCalls += 1;
          return mode === "processing-db" && updateCalls === 1
            ? { error: { code: "XX000", message: RAW_FAILURE } }
            : { error: null };
        },
      }),
    }),
    auth: {
      admin: {
        listUsers: () => {
          if (mode === "throw-list") throw new Error(RAW_FAILURE);
          return { data: { users: [] }, error: null };
        },
        inviteUserByEmail: () => ({
          data: { user: null },
          error: { code: "unexpected_failure", message: RAW_FAILURE },
        }),
      },
    },
  };
  return {
    admin,
    gestor: {
      id: "gestor-1",
      auth_user_id: "11111111-1111-4111-8111-111111111111",
    },
    gestorEmail: "gestor@example.com",
    json: (payload: Record<string, unknown>, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
  } as HandlerContext;
};

const requestOptions = {
  redirectTo: "https://universocc.com.br/login",
  supabaseUrl: "https://project.supabase.co",
  publicApiKey: { apiKey: null, message: null },
};

Deno.test("Aluno não expõe detalhes hostis de Error, PostgREST ou Auth", async () => {
  for (
    const mode of [
      "throw-list",
      "processing-db",
      "invite-result",
    ] as const
  ) {
    const response = await handleSendStudentInvite(
      makeContext(mode),
      partner,
      requestOptions,
    );
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(body), /db-host|segredo-operacional/);
  }
});
