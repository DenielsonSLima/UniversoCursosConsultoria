import assert from "node:assert/strict";
import { handleEnsureProfessorAccess } from "./ensure-professor-access.ts";
import type { HandlerContext, Partner } from "../types.ts";

const CPF = "52998224725";
const EMAIL = "pessoa@example.com";
const AUTH_ID = "11111111-1111-4111-8111-111111111111";

const professor: Partner = {
  id: "professor-1",
  tipo: "Professor",
  nome: "Pessoa Teste",
  status: "ATIVO",
  cpf_cnpj: CPF,
  email: EMAIL,
};

const makeFixture = (responsavelCpf = CPF) => {
  const linkedPayloads: Array<Record<string, unknown>> = [];
  let inviteCalls = 0;
  let recoveryCalls = 0;
  let passwordCalls = 0;
  const authUser = {
    id: AUTH_ID,
    email: EMAIL,
    user_metadata: { partner_id: "perfil-que-nao-existe" },
  };
  const rows: Record<string, Array<Record<string, unknown>>> = {
    parceiros: [{
      id: "aluno-1",
      tipo: "Aluno",
      cpf_cnpj: CPF,
      email: "contato-aluno@example.com",
      auth_login_email: EMAIL,
    }],
    responsaveis_legais: [{
      id: "responsavel-1",
      cpf_normalizado: responsavelCpf,
      email: EMAIL,
    }],
  };

  const admin = {
    from: (table: string) => {
      if (table === "parceiros") {
        return {
          select: (columns: string) => {
            if (columns.includes("status")) {
              const currentQuery: any = {
                eq: () => currentQuery,
                maybeSingle: async () => ({
                  data: {
                    id: professor.id,
                    tipo: professor.tipo,
                    status: professor.status,
                    email: professor.email,
                    auth_user_id: null,
                    auth_login_email: null,
                  },
                  error: null,
                }),
              };
              return currentQuery;
            }
            const ownershipQuery: any = {
              eq: () => ownershipQuery,
              neq: () => ownershipQuery,
              limit: async () => ({ data: rows.parceiros, error: null }),
            };
            return ownershipQuery;
          },
          update: (payload: Record<string, unknown>) => {
            linkedPayloads.push(payload);
            const query: any = {
              eq: () => query,
              is: () => query,
              select: () => query,
              maybeSingle: async () => ({
                data: { id: professor.id, ...payload },
                error: null,
              }),
            };
            return query;
          },
        };
      }
      return {
        select: () => {
          const query: any = {
            eq: () => query,
            limit: async () => ({ data: rows[table] || [], error: null }),
          };
          return query;
        },
      };
    },
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: [authUser] },
          error: null,
        }),
        inviteUserByEmail: async () => {
          inviteCalls += 1;
          throw new Error("convite não deveria ser enviado");
        },
        generateLink: async () => {
          recoveryCalls += 1;
          throw new Error("recovery não deveria ser gerado");
        },
        updateUserById: async () => {
          passwordCalls += 1;
          throw new Error("senha não deveria ser alterada");
        },
      },
    },
  };

  const context: HandlerContext = {
    admin,
    gestor: {
      id: "gestor-1",
      context: "global",
      polo_ids: [],
      permissoes: {
        modules: ["parceiros", "configuracoes"],
        financeiroTabs: [],
        allPolos: true,
        tabs: {},
      },
    },
    gestorEmail: "gestor@example.com",
    json: (payload, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
  };
  return {
    context,
    linkedPayloads,
    counts: () => ({ inviteCalls, recoveryCalls, passwordCalls }),
  };
};

Deno.test("ensure vincula Professor ao Auth multipapel sem tocar na senha", async () => {
  const fixture = makeFixture();
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.profileLinked, true);
  assert.equal(body.userId, AUTH_ID);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    recoveryCalls: 0,
    passwordCalls: 0,
  });
  assert.equal(fixture.linkedPayloads[0].auth_user_id, AUTH_ID);
  assert.equal(
    fixture.linkedPayloads[0].primeiro_acesso_institucional_pendente,
    false,
  );
});

Deno.test("ensure rejeita identidade quando um dos perfis diverge", async () => {
  const fixture = makeFixture("11111111111");
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /responsável legal/i);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    recoveryCalls: 0,
    passwordCalls: 0,
  });
  assert.equal(fixture.linkedPayloads.length, 0);
});
