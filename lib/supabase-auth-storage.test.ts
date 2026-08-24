import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupabaseAuthStorageKey,
  clearSupabaseAuthStorage,
} from "./supabase-auth-storage.ts";

test("deriva a mesma chave padrão usada pelo cliente Supabase", () => {
  assert.equal(
    buildSupabaseAuthStorageKey("https://projeto.supabase.co"),
    "sb-projeto-auth-token",
  );
});

test("remove token, verificador PKCE e usuário persistidos", () => {
  const removed: string[] = [];
  const result = clearSupabaseAuthStorage(
    { removeItem: (key) => removed.push(key) },
    "sb-projeto-auth-token",
  );

  assert.equal(result, true);
  assert.deepEqual(removed, [
    "sb-projeto-auth-token",
    "sb-projeto-auth-token-code-verifier",
    "sb-projeto-auth-token-user",
  ]);
});

test("informa quando o armazenamento não pôde ser limpo", () => {
  const result = clearSupabaseAuthStorage(
    {
      removeItem: () => {
        throw new Error("storage indisponível");
      },
    },
    "sb-projeto-auth-token",
  );

  assert.equal(result, false);
});
