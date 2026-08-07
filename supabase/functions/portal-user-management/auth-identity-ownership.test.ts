import assert from "node:assert/strict";
import { findAuthIdentityConflict } from "./auth-identity-ownership.ts";

const adminWith = (
  rows: { parceiros?: any[]; usuarios_sistema?: any[] },
) => ({
  from: (table: "parceiros" | "usuarios_sistema") => ({
    select: () => {
      const query: any = {
        eq: () => query,
        neq: () => query,
        limit: async () => ({ data: rows[table] || [], error: null }),
      };
      return query;
    },
  }),
});

Deno.test("aceita identidade sem vínculo concorrente", async () => {
  assert.deepEqual(
    await findAuthIdentityConflict(adminWith({}), "partner-1", "auth-1"),
    { error: null, conflict: null },
  );
});

Deno.test("recusa identidade já vinculada a outro parceiro", async () => {
  const result = await findAuthIdentityConflict(
    adminWith({ parceiros: [{ id: "partner-2" }] }),
    "partner-1",
    "auth-1",
  );
  assert.equal(result.error, null);
  assert.match(String(result.conflict), /outro parceiro/i);
});

Deno.test("recusa identidade usada por usuário interno", async () => {
  const result = await findAuthIdentityConflict(
    adminWith({ usuarios_sistema: [{ id: "gestor-1" }] }),
    "partner-1",
    "auth-1",
  );
  assert.equal(result.error, null);
  assert.match(String(result.conflict), /usuário interno/i);
});
