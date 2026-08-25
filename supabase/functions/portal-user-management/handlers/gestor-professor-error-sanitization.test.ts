import assert from "node:assert/strict";
import { handleLinkProfessorAuthIdentity } from "./link-professor-auth-identity.ts";
import { handleUpsertGestorUser } from "./upsert-gestor-user.ts";
import { handleDeletePartner } from "./delete-partner.ts";
import type { HandlerContext, Partner } from "../types.ts";

const SECRET = "db-host.internal token=segredo-super-secreto";
const AUTH_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "pessoa@example.com";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), { status });

const gestor = {
  id: "gestor-1",
  context: "global",
  polo_ids: [],
  permissoes: {
    modules: ["configuracoes"],
    financeiroTabs: [],
    allPolos: true,
    tabs: {},
  },
};

const captureControlledLog = async (run: () => Promise<Response>) => {
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => entries.push(args);
  try {
    const response = await run();
    return { response, serializedLogs: JSON.stringify(entries) };
  } finally {
    console.error = original;
  }
};

Deno.test("Professor não recebe detalhe interno da consulta Auth", async () => {
  const partner: Partner = {
    id: "professor-1",
    tipo: "Professor",
    nome: "Pessoa Teste",
    email: EMAIL,
    auth_login_email: EMAIL,
    cpf_cnpj: "52998224725",
    auth_user_id: AUTH_ID,
  };
  const context: HandlerContext = {
    admin: {
      auth: {
        admin: {
          getUserById: async () => {
            throw new Error(SECRET);
          },
        },
      },
    },
    gestor,
    gestorEmail: "gestor@example.com",
    json: responder,
  };

  const { response, serializedLogs } = await captureControlledLog(() =>
    handleLinkProfessorAuthIdentity(context, partner)
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /não foi possível verificar/i);
  assert.doesNotMatch(JSON.stringify(body), /db-host|segredo|token=/i);
  assert.doesNotMatch(serializedLogs, /db-host|segredo|token=/i);
});

Deno.test("Gestor não recebe detalhe interno da busca Auth", async () => {
  const context: HandlerContext = {
    admin: {
      rpc: async () => ({
        data: [{ email_em_uso: false, cpf_em_uso: false }],
        error: null,
      }),
      auth: {
        admin: {
          listUsers: async () => {
            throw new Error(SECRET);
          },
        },
      },
    },
    gestor,
    gestorEmail: "gestor@example.com",
    json: responder,
  };

  const { response, serializedLogs } = await captureControlledLog(() =>
    handleUpsertGestorUser(context, {
      nome: "Gestora Teste",
      email: EMAIL,
      telefone: "79999999999",
      cpf: "12345678909",
      status: "Ativo",
      context: "global",
      polo_ids: [],
      permissoes: gestor.permissoes,
      setor_comunicacao: "todos",
      pode_visualizar_todos_polos: true,
      pode_visualizar_todos_setores: true,
    })
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /não foi possível localizar/i);
  assert.doesNotMatch(JSON.stringify(body), /db-host|segredo|token=/i);
  assert.doesNotMatch(serializedLogs, /db-host|segredo|token=/i);
});

Deno.test("Professor sanitiza exceção inesperada durante o vínculo", async () => {
  const partner: Partner = {
    id: "professor-2",
    tipo: "Professor",
    nome: "Pessoa Teste",
    email: EMAIL,
    cpf_cnpj: "52998224725",
  };
  const context: HandlerContext = {
    admin: {
      from: (table: string) => ({
        select: () => {
          const query: any = {
            eq: () => query,
            neq: () => query,
            limit: async () => ({
              data: table === "usuarios_sistema"
                ? [{ id: "gestor-2", cpf: partner.cpf_cnpj, email: EMAIL }]
                : [],
              error: null,
            }),
          };
          return query;
        },
        update: () => {
          throw new Error(SECRET);
        },
      }),
      auth: {
        admin: {
          listUsers: async () => ({
            data: { users: [{ id: AUTH_ID, email: EMAIL }] },
            error: null,
          }),
        },
      },
    },
    gestor,
    gestorEmail: "gestor@example.com",
    json: responder,
  };

  const { response, serializedLogs } = await captureControlledLog(() =>
    handleLinkProfessorAuthIdentity(context, partner)
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /não foi possível vincular/i);
  assert.doesNotMatch(JSON.stringify(body), /db-host|segredo|token=/i);
  assert.doesNotMatch(serializedLogs, /db-host|segredo|token=/i);
});

Deno.test("Gestor sanitiza exceção inesperada do preflight", async () => {
  const context: HandlerContext = {
    admin: {
      rpc: async () => {
        throw new Error(SECRET);
      },
    },
    gestor,
    gestorEmail: "gestor@example.com",
    json: responder,
  };

  const { response, serializedLogs } = await captureControlledLog(() =>
    handleUpsertGestorUser(context, {
      nome: "Gestora Teste",
      email: EMAIL,
      telefone: "79999999999",
      cpf: "12345678909",
      status: "Ativo",
      context: "global",
      polo_ids: [],
      permissoes: gestor.permissoes,
      setor_comunicacao: "todos",
      pode_visualizar_todos_polos: true,
      pode_visualizar_todos_setores: true,
    })
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /não foi possível concluir/i);
  assert.doesNotMatch(JSON.stringify(body), /db-host|segredo|token=/i);
  assert.doesNotMatch(serializedLogs, /db-host|segredo|token=/i);
});

Deno.test("exclusão de parceiro sanitiza conflitos e falhas internas", async () => {
  for (const code of ["40001", "40P01", "XX000"]) {
    const context: HandlerContext = {
      admin: {
        from: (table: string) => {
          if (table === "documentos_aluno_lotes") {
            return {
              select: () => ({
                eq: async () => ({ count: 0, error: null }),
              }),
            };
          }
          return {
            delete: () => ({
              eq: async () => ({ error: { code, message: SECRET } }),
            }),
          };
        },
      },
      gestor,
      gestorEmail: "gestor@example.com",
      json: responder,
    };
    const partner: Partner = {
      id: "professor-delete",
      tipo: "Professor",
      nome: "Pessoa Teste",
    };

    const { response, serializedLogs } = await captureControlledLog(() =>
      handleDeletePartner(context, partner)
    );
    const body = await response.json();

    assert.equal(response.status, code === "XX000" ? 500 : 409);
    assert.match(
      body.error,
      code === "XX000"
        ? /não foi possível excluir/i
        : /vínculo de acesso mudou/i,
    );
    assert.doesNotMatch(JSON.stringify(body), /db-host|segredo|token=/i);
    assert.doesNotMatch(serializedLogs, /db-host|segredo|token=/i);
  }
});
