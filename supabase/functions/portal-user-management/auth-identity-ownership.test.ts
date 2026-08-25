import assert from "node:assert/strict";
import { findAuthIdentityConflict } from "./auth-identity-ownership.ts";
import type { Partner } from "./types.ts";

const AUTH_ID = "11111111-1111-4111-8111-111111111111";
const CPF = "52998224725";
const EMAIL = "pessoa@example.com";

const aluno: Partner = {
  id: "aluno-1",
  tipo: "Aluno",
  nome: "Pessoa Teste",
  cpf_cnpj: CPF,
  email: EMAIL,
  auth_login_email: EMAIL,
};

type FixtureOptions = {
  rows?: Record<string, Array<Record<string, unknown>>>;
  failingTable?: string;
  malformedTable?: string;
};

const makeAdmin = (options: FixtureOptions = {}) => ({
  from: (table: string) => ({
    select: () => {
      const query: any = {
        eq: () => query,
        neq: () => query,
        limit: async () => ({
          data: table === options.malformedTable
            ? null
            : options.rows?.[table] || [],
          error: table === options.failingTable
            ? { message: `falha em ${table}` }
            : null,
        }),
      };
      return query;
    },
  }),
});

Deno.test("aceita identidade sem outro perfil canônico", async () => {
  assert.deepEqual(
    await findAuthIdentityConflict(makeAdmin(), aluno, AUTH_ID),
    { error: null, conflict: null, hasCompatibleProfile: false },
  );
});

Deno.test("aceita Aluno com Professor, Gestor e Responsável coincidentes", async () => {
  const result = await findAuthIdentityConflict(
    makeAdmin({
      rows: {
        parceiros: [{
          id: "professor-1",
          tipo: "Professor",
          cpf_cnpj: "529.982.247-25",
          email: "contato-professor@example.com",
          auth_login_email: EMAIL,
        }],
        usuarios_sistema: [{ id: "gestor-1", cpf: CPF, email: EMAIL }],
        responsaveis_legais: [{
          id: "responsavel-1",
          cpf_normalizado: CPF,
          email: EMAIL,
        }],
      },
    }),
    aluno,
    AUTH_ID,
  );

  assert.deepEqual(result, {
    error: null,
    conflict: null,
    hasCompatibleProfile: true,
  });
});

Deno.test("recusa outro parceiro com o mesmo papel mesmo se os dados coincidem", async () => {
  const result = await findAuthIdentityConflict(
    makeAdmin({
      rows: {
        parceiros: [{
          id: "aluno-2",
          tipo: "Aluno",
          cpf_cnpj: CPF,
          email: EMAIL,
        }],
      },
    }),
    aluno,
    AUTH_ID,
  );

  assert.equal(result.hasCompatibleProfile, false);
  assert.match(String(result.conflict), /mesmo papel/i);
});

Deno.test("recusa papel de parceiro diferente do oposto", async () => {
  const result = await findAuthIdentityConflict(
    makeAdmin({
      rows: {
        parceiros: [{
          id: "parceiro-2",
          tipo: "Conveniado",
          cpf_cnpj: CPF,
          email: EMAIL,
        }],
      },
    }),
    aluno,
    AUTH_ID,
  );

  assert.match(String(result.conflict), /papel incompatível/i);
});

Deno.test("recusa CPF ou e-mail canônico divergente no parceiro oposto", async () => {
  const result = await findAuthIdentityConflict(
    makeAdmin({
      rows: {
        parceiros: [{
          id: "professor-1",
          tipo: "Professor",
          cpf_cnpj: CPF,
          email: EMAIL,
          auth_login_email: "outro-login@example.com",
        }],
      },
    }),
    aluno,
    AUTH_ID,
  );

  assert.match(String(result.conflict), /CPF ou e-mail/i);
});

Deno.test("um único perfil divergente invalida toda a identidade", async () => {
  const result = await findAuthIdentityConflict(
    makeAdmin({
      rows: {
        parceiros: [{
          id: "professor-1",
          tipo: "Professor",
          cpf_cnpj: CPF,
          email: EMAIL,
        }],
        usuarios_sistema: [{ id: "gestor-1", cpf: CPF, email: EMAIL }],
        responsaveis_legais: [{
          id: "responsavel-1",
          cpf_normalizado: "11111111111",
          email: EMAIL,
        }],
      },
    }),
    aluno,
    AUTH_ID,
  );

  assert.equal(result.hasCompatibleProfile, false);
  assert.match(String(result.conflict), /responsável legal/i);
});

Deno.test("recusa cadastros canônicos duplicados no mesmo papel", async () => {
  const result = await findAuthIdentityConflict(
    makeAdmin({
      rows: {
        usuarios_sistema: [
          { id: "gestor-1", cpf: CPF, email: EMAIL },
          { id: "gestor-2", cpf: CPF, email: EMAIL },
        ],
      },
    }),
    aluno,
    AUTH_ID,
  );

  assert.match(String(result.conflict), /mais de um usuário interno/i);
});

for (
  const table of ["parceiros", "usuarios_sistema", "responsaveis_legais"]
) {
  Deno.test(`falha fechado quando a consulta de ${table} falha`, async () => {
    const result = await findAuthIdentityConflict(
      makeAdmin({ failingTable: table }),
      aluno,
      AUTH_ID,
    );

    assert.equal(
      result.error,
      "Não foi possível validar os vínculos da identidade de acesso.",
    );
    assert.equal(result.conflict, null);
    assert.equal(result.hasCompatibleProfile, false);
  });
}

Deno.test("falha fechado quando uma consulta retorna formato inesperado", async () => {
  const result = await findAuthIdentityConflict(
    makeAdmin({ malformedTable: "responsaveis_legais" }),
    aluno,
    AUTH_ID,
  );

  assert.match(String(result.error), /os vínculos/i);
  assert.equal(result.hasCompatibleProfile, false);
});
