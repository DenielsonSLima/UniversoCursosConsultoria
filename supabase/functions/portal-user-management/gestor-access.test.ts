/// <reference lib="deno.ns" />

import assert from "node:assert/strict";
import { ensureAuthorizedGestor } from "./gestor-access.ts";

type FixtureOptions = {
  authUser?: { id: string; email: string } | null;
  gestor?: Record<string, unknown> | null;
};

const makeFixture = (options: FixtureOptions = {}) => {
  const filters: Array<[string, unknown]> = [];
  const gestor = options.gestor ?? null;
  const authUser = options.authUser ?? {
    id: "auth-gestor-atual",
    email: "gestor@example.com",
  };

  const admin = {
    auth: {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    },
    from: (table: string) => {
      assert.equal(table, "usuarios_sistema");
      const query: any = {
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => {
          const matches = gestor &&
            filters.every(([column, value]) => gestor[column] === value);
          return { data: matches ? gestor : null, error: null };
        },
      };
      return { select: () => query };
    },
  };

  return { admin, filters };
};

const activeGestor = (authUserId: string) => ({
  id: "gestor-interno-1",
  auth_user_id: authUserId,
  nome: "Gestor de teste",
  email: "gestor@example.com",
  status: "ATIVO",
  context: "global",
  polo_ids: [],
  permissoes: {
    modules: ["parceiros"],
    financeiroTabs: [],
    allPolos: true,
    tabs: {},
  },
  perfil_acesso_id: null,
  personalizar_permissoes: true,
  restricao_horario: null,
  perfis_acesso: null,
});

Deno.test(
  "recusa gestor quando o UID da sessão não corresponde ao usuário institucional",
  async () => {
    const fixture = makeFixture({
      gestor: activeGestor("auth-de-outra-pessoa"),
    });

    const result = await ensureAuthorizedGestor(fixture.admin, "token-valido");

    assert.equal(result.authorized, false);
    assert.match(String(result.error), /acesso restrito/i);
  },
);

Deno.test(
  "autoriza gestor quando o UID da sessão corresponde ao usuário institucional",
  async () => {
    const fixture = makeFixture({
      gestor: activeGestor("auth-gestor-atual"),
    });

    const result = await ensureAuthorizedGestor(fixture.admin, "token-valido");

    assert.equal(result.authorized, true);
    if (!result.authorized) throw new Error("Gestor deveria estar autorizado");
    assert.equal(result.gestor.id, "gestor-interno-1");
    assert.equal(result.gestorEmail, "gestor@example.com");
  },
);
