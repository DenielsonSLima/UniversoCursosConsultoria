/// <reference lib="deno.ns" />

import assert from "node:assert/strict";
import { ensureAuthorizedGestor } from "./gestor-access.ts";

type FixtureOptions = {
  authUser?: { id: string; email: string } | null;
  gestor?: Record<string, unknown> | null;
  institutionalAccessAllowed?: boolean;
  institutionalAccessError?: { message: string } | null;
};

const makeFixture = (options: FixtureOptions = {}) => {
  const filters: Array<[string, unknown]> = [];
  const gestor = options.gestor ?? null;
  const authUser = options.authUser ?? {
    id: "auth-gestor-atual",
    email: "gestor@example.com",
  };
  const events: string[] = [];
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];

  const admin = {
    auth: {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      events.push("rpc");
      rpcCalls.push([name, args]);
      return {
        data: options.institutionalAccessAllowed ?? true,
        error: options.institutionalAccessError ?? null,
      };
    },
    from: (table: string) => {
      events.push("usuarios_sistema");
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

  return { admin, events, filters, rpcCalls };
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
  "recusa gestor enquanto o convite institucional ainda exige criação da senha",
  async () => {
    const fixture = makeFixture({
      gestor: activeGestor("auth-gestor-atual"),
      institutionalAccessAllowed: false,
    });

    const result = await ensureAuthorizedGestor(fixture.admin, "token-valido");

    assert.equal(result.authorized, false);
    assert.match(String(result.error), /criação da sua senha institucional/i);
    assert.deepEqual(fixture.events, ["rpc"]);
    assert.deepEqual(fixture.rpcCalls, [[
      "portal_identidade_institucional_acesso_liberado",
      { p_auth_user_id: "auth-gestor-atual", p_perfil: "GESTOR" },
    ]]);
  },
);

Deno.test(
  "falha fechada quando o gate institucional não pode ser consultado",
  async () => {
    const fixture = makeFixture({
      gestor: activeGestor("auth-gestor-atual"),
      institutionalAccessError: { message: "RPC indisponível" },
    });

    const result = await ensureAuthorizedGestor(fixture.admin, "token-valido");

    assert.equal(result.authorized, false);
    assert.deepEqual(fixture.events, ["rpc"]);
  },
);

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
    assert.deepEqual(fixture.events, ["rpc", "usuarios_sistema"]);
  },
);
