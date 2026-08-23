import assert from "node:assert/strict";
import test from "node:test";
import { performPortalLogout } from "./portal-logout-flow.ts";

test("rejeição global e local ainda alcança a limpeza direta", async () => {
  const scopes: string[] = [];
  let forceClearCalls = 0;

  const result = await performPortalLogout("global", {
    signOut: async (scope) => {
      scopes.push(scope);
      throw new Error(`${scope} indisponível`);
    },
    forceClearLocal: () => {
      forceClearCalls += 1;
      return true;
    },
  });

  assert.equal(result.status, "local-only");
  assert.deepEqual(scopes, ["global", "local"]);
  assert.equal(forceClearCalls, 1);
});

test("erro retornado e rejeição recebem o mesmo fallback", async () => {
  let attempt = 0;
  const result = await performPortalLogout("global", {
    signOut: async () => {
      attempt += 1;
      if (attempt === 1) return { error: new Error("global") };
      throw new Error("local");
    },
    forceClearLocal: () => true,
  });

  assert.equal(result.status, "local-only");
});

test("só propaga a falha global quando a limpeza direta também falha", async () => {
  const globalError = new Error("falha global");

  await assert.rejects(
    performPortalLogout("global", {
      signOut: async (scope) => {
        if (scope === "global") throw globalError;
        return { error: new Error("falha local") };
      },
      forceClearLocal: () => false,
    }),
    (error) => error === globalError,
  );
});

test("logout local automático remove o token direto quando a rede falha", async () => {
  let forceClearCalls = 0;
  const localError = new Error("falha local");

  const result = await performPortalLogout("local", {
    signOut: async () => {
      throw localError;
    },
    forceClearLocal: () => {
      forceClearCalls += 1;
      return true;
    },
  });

  assert.deepEqual(result, { status: "local-cleared", localError });
  assert.equal(forceClearCalls, 1);
});

test("logout local só propaga a falha quando nem o storage pode ser limpo", async () => {
  const localError = new Error("falha local");

  await assert.rejects(
    performPortalLogout("local", {
      signOut: async () => ({ error: localError }),
      forceClearLocal: () => false,
    }),
    (error) => error === localError,
  );
});
