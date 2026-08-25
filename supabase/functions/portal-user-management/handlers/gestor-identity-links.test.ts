import assert from "node:assert/strict";
import { findGestorIdentityConflict } from "./gestor-identity-links.ts";

const AUTH_ID = "11111111-1111-4111-8111-111111111111";
const CPF = "52998224725";
const EMAIL = "pessoa@example.com";

const makeAdmin = (
  rows: Record<string, Array<Record<string, unknown>>>,
  failingTable?: string,
) => ({
  from: (table: string) => ({
    select: () => {
      const query: any = {
        eq: () => query,
        limit: async () => ({
          data: rows[table] || [],
          error: table === failingTable ? { message: "lookup failed" } : null,
        }),
      };
      return query;
    },
  }),
});

Deno.test("reutiliza identidade quando Aluno, Professor e Responsável conferem", async () => {
  const result = await findGestorIdentityConflict(
    makeAdmin({
      parceiros: [
        {
          id: "aluno",
          tipo: "Aluno",
          cpf_cnpj: "529.982.247-25",
          email: "contato@example.com",
          auth_login_email: EMAIL,
        },
        {
          id: "professor",
          tipo: "Professor",
          cpf_cnpj: CPF,
          email: EMAIL,
          auth_login_email: null,
        },
      ],
      responsaveis_legais: [{
        id: "responsavel",
        cpf_normalizado: CPF,
        email: EMAIL,
      }],
    }),
    AUTH_ID,
    CPF,
    EMAIL,
  );

  assert.equal(result.error, null);
  assert.equal(result.conflict, null);
  assert.equal(result.reusableIdentity, true);
});

Deno.test("fecha o vínculo quando qualquer perfil existente diverge", async () => {
  const result = await findGestorIdentityConflict(
    makeAdmin({
      parceiros: [{
        id: "aluno",
        cpf_cnpj: CPF,
        email: EMAIL,
      }],
      responsaveis_legais: [{
        id: "responsavel",
        cpf_normalizado: "11111111111",
        email: EMAIL,
      }],
    }),
    AUTH_ID,
    CPF,
    EMAIL,
  );

  assert.equal(result.reusableIdentity, false);
  assert.match(String(result.conflict), /não confere|diverge/i);
});

Deno.test("não cria um segundo Gestor para o mesmo UID", async () => {
  const result = await findGestorIdentityConflict(
    makeAdmin({ usuarios_sistema: [{ id: "gestor-existente" }] }),
    AUTH_ID,
    CPF,
    EMAIL,
  );

  assert.equal(result.reusableIdentity, false);
  assert.match(String(result.conflict), /usuário interno/i);
});

Deno.test("falha fechado quando uma consulta de titularidade falha", async () => {
  const result = await findGestorIdentityConflict(
    makeAdmin({}, "responsaveis_legais"),
    AUTH_ID,
    CPF,
    EMAIL,
  );

  assert.equal(
    result.error,
    "Não foi possível validar os vínculos da identidade de acesso.",
  );
  assert.equal(result.reusableIdentity, false);
});
