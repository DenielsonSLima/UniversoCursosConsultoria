import assert from "node:assert/strict";
import { handleSendStudentInvite } from "./send-student-invite.ts";
import { SHARED_CREDENTIAL_READY_RPC } from "./student-access-identity.ts";
import type { HandlerContext, Partner } from "../types.ts";

const CPF = "52998224725";
const EMAIL = "pessoa@example.com";
const AUTH_ID = "11111111-1111-4111-8111-111111111111";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), { status });

const student: Partner = {
  id: "aluno-1",
  tipo: "Aluno",
  nome: "Pessoa Teste",
  cpf_cnpj: CPF,
  email: EMAIL,
  auth_login_email: EMAIL,
};

type FixtureOptions = {
  responsavelCpf?: string;
  credentialReady?: boolean;
  credentialLookupFails?: boolean;
  bindingErrorCode?: string;
};

const makeFixture = (options: FixtureOptions = {}) => {
  const updates: Array<Record<string, unknown>> = [];
  let inviteCalls = 0;
  let createCalls = 0;
  let generateLinkCalls = 0;
  let updatePasswordCalls = 0;
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const authUser = {
    id: AUTH_ID,
    email: EMAIL,
    email_confirmed_at: "2026-08-20T10:00:00.000Z",
    // Metadado propositalmente hostil: não pode participar da autorização.
    user_metadata: { partner_id: "cadastro-inexistente" },
  };
  const rows: Record<string, Array<Record<string, unknown>>> = {
    parceiros: [{
      id: "professor-1",
      tipo: "Professor",
      cpf_cnpj: CPF,
      email: "contato-professor@example.com",
      auth_login_email: EMAIL,
    }],
    usuarios_sistema: [{ id: "gestor-1", cpf: CPF, email: EMAIL }],
    responsaveis_legais: [{
      id: "responsavel-1",
      cpf_normalizado: options.responsavelCpf || CPF,
      email: EMAIL,
    }],
  };

  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return options.credentialLookupFails
        ? { data: null, error: { message: "lookup failed" } }
        : { data: options.credentialReady !== false, error: null };
    },
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        const query: any = {
          eq: () => query,
          is: () => query,
          select: () => query,
          maybeSingle: async () =>
            options.bindingErrorCode
              ? {
                data: null,
                error: {
                  code: options.bindingErrorCode,
                  message:
                    "PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_ALTERADA",
                },
              }
              : {
                data: { id: student.id, ...payload },
                error: null,
              },
        };
        return query;
      },
      select: () => {
        const query: any = {
          eq: () => query,
          neq: () => query,
          limit: async () => ({ data: rows[table] || [], error: null }),
        };
        return query;
      },
    }),
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: [authUser] },
          error: null,
        }),
        getUserById: async () => ({
          data: { user: authUser },
          error: null,
        }),
        inviteUserByEmail: async () => {
          inviteCalls += 1;
          throw new Error("convite não deveria ser enviado");
        },
        createUser: async () => {
          createCalls += 1;
          throw new Error("Auth não deveria ser criado");
        },
        generateLink: async () => {
          generateLinkCalls += 1;
          throw new Error("recovery não deveria ser gerado");
        },
        updateUserById: async () => {
          updatePasswordCalls += 1;
          throw new Error("senha não deveria ser alterada");
        },
      },
    },
  };

  const context: HandlerContext = {
    admin,
    gestor: { id: "gestor-1" },
    gestorEmail: "gestor@example.com",
    json: responder,
  };
  return {
    context,
    updates,
    rpcCalls,
    counts: () => ({
      inviteCalls,
      createCalls,
      generateLinkCalls,
      updatePasswordCalls,
    }),
  };
};

const requestOptions = {
  redirectTo: "https://universocc.com.br/login",
  supabaseUrl: "https://project.supabase.co",
  publicApiKey: { apiKey: null, message: "E-mail indisponível." },
};

Deno.test("vincula Aluno ao Auth multipapel e preserva a senha atual", async () => {
  const fixture = makeFixture();
  const response = await handleSendStudentInvite(
    fixture.context,
    student,
    requestOptions,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, "link-existing-identity");
  assert.equal(body.profileLinked, true);
  assert.equal(body.studentAccessPending, false);
  assert.deepEqual(fixture.rpcCalls, [{
    name: SHARED_CREDENTIAL_READY_RPC,
    args: {
      p_auth_user_id: AUTH_ID,
      p_exclude_partner_id: student.id,
      p_exclude_responsavel_id: null,
    },
  }]);
  assert.equal(body.recoveryLink, null);
  assert.match(body.message, /senha atual foi preservada/i);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    createCalls: 0,
    generateLinkCalls: 0,
    updatePasswordCalls: 0,
  });
  assert.ok(
    fixture.updates.some((payload) =>
      payload.auth_user_id === AUTH_ID &&
      payload.auth_login_email === EMAIL &&
      payload.acesso_status === "ativo" &&
      typeof payload.senha_atualizada_em === "string" &&
      payload.troca_senha_obrigatoria === false
    ),
  );
});

Deno.test("mantém Aluno pendente quando o outro perfil ainda não concluiu o acesso", async () => {
  const fixture = makeFixture({ credentialReady: false });
  const response = await handleSendStudentInvite(
    fixture.context,
    student,
    requestOptions,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.studentAccessPending, true);
  assert.match(body.message, /permanece pendente/i);
  assert.ok(
    fixture.updates.some((payload) =>
      payload.auth_user_id === AUTH_ID &&
      payload.acesso_status === "pendente" &&
      payload.troca_senha_obrigatoria === true
    ),
  );
  assert.equal(
    fixture.updates.some((payload) => payload.acesso_status === "ativo"),
    false,
  );
  assert.equal(
    fixture.updates.some((payload) => payload.senha_atualizada_em),
    false,
  );
});

Deno.test("não reutiliza identidade enquanto o alvo possui fence temporária", async () => {
  const fixture = makeFixture();
  const response = await handleSendStudentInvite(
    fixture.context,
    {
      ...student,
      senha_temporaria_pendente: true,
      senha_temporaria_emissao_id: "22222222-2222-4222-8222-222222222222",
    },
    requestOptions,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /temporário.*andamento/i);
  assert.equal(
    fixture.updates.some((payload) => payload.auth_user_id === AUTH_ID),
    false,
  );
});

Deno.test("Aluno legado ativo sem timestamp recebe a prova local do perfil compartilhado", async () => {
  const fixture = makeFixture();
  const response = await handleSendStudentInvite(
    fixture.context,
    {
      ...student,
      acesso_status: "ativo",
      troca_senha_obrigatoria: false,
      senha_atualizada_em: null,
    },
    requestOptions,
  );

  assert.equal(response.status, 200);
  assert.ok(
    fixture.updates.some((payload) =>
      payload.auth_user_id === AUTH_ID &&
      typeof payload.senha_atualizada_em === "string"
    ),
  );
});

Deno.test("falha fechado quando a prova de credencial não pode ser consultada", async () => {
  const fixture = makeFixture({ credentialLookupFails: true });
  const response = await handleSendStudentInvite(
    fixture.context,
    student,
    requestOptions,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.success, false);
  assert.match(body.error, /primeiro acesso/i);
  assert.equal(
    fixture.updates.some((payload) => payload.auth_user_id === AUTH_ID),
    false,
  );
});

Deno.test("conflito transacional da credencial pede retry sem expor SQL", async () => {
  for (const code of ["40001", "40P01"]) {
    const fixture = makeFixture({ bindingErrorCode: code });
    const response = await handleSendStudentInvite(
      fixture.context,
      student,
      requestOptions,
    );
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.success, false);
    assert.match(body.error, /mudou durante o vínculo/i);
    assert.doesNotMatch(JSON.stringify(body), /PORTAL_IDENTIDADE/);
  }
});

Deno.test("replay de Aluno ativo não consulta prova nem rebaixa o acesso", async () => {
  const fixture = makeFixture({ credentialLookupFails: true });
  const activeStudent: Partner = {
    ...student,
    auth_user_id: AUTH_ID,
    acesso_status: "ativo",
    troca_senha_obrigatoria: false,
    senha_atualizada_em: "2026-08-20T10:00:00.000Z",
  };
  const response = await handleSendStudentInvite(
    fixture.context,
    activeStudent,
    requestOptions,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.studentAccessPending, false);
  assert.equal(fixture.rpcCalls.length, 0);
  assert.equal(
    fixture.updates.some((payload) =>
      payload.troca_senha_obrigatoria === true ||
      payload.acesso_status === "pendente" ||
      payload.acesso_ativado_em === null
    ),
    false,
  );
});

Deno.test("não vincula quando qualquer perfil do UID possui CPF divergente", async () => {
  const fixture = makeFixture({ responsavelCpf: "11111111111" });
  const response = await handleSendStudentInvite(
    fixture.context,
    student,
    requestOptions,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.match(body.error, /responsável legal/i);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    createCalls: 0,
    generateLinkCalls: 0,
    updatePasswordCalls: 0,
  });
  assert.equal(
    fixture.updates.some((payload) => payload.auth_user_id === AUTH_ID),
    false,
  );
});
