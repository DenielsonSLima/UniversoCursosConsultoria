import assert from "node:assert/strict";
import { shouldSkipTechnicalManualFutureSync } from "./technical-manual-future-sync.ts";

Deno.test("guarda consulta a RPC canônica com a matrícula exata", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve({ data: true, error: null });
    },
  };

  const skipped = await shouldSkipTechnicalManualFutureSync(
    admin,
    " 11111111-1111-4111-8111-111111111111 ",
  );

  assert.equal(skipped, true);
  assert.deepEqual(calls, [{
    name: "should_skip_technical_manual_future_sync",
    args: { p_matricula_id: "11111111-1111-4111-8111-111111111111" },
  }]);
});

Deno.test("guarda não altera fluxos sem matrícula ou fora da política", async () => {
  let calls = 0;
  const admin = {
    rpc: () => {
      calls += 1;
      return Promise.resolve({ data: false, error: null });
    },
  };

  assert.equal(
    await shouldSkipTechnicalManualFutureSync(admin, ""),
    false,
  );
  assert.equal(calls, 0);
  assert.equal(
    await shouldSkipTechnicalManualFutureSync(
      admin,
      "22222222-2222-4222-8222-222222222222",
    ),
    false,
  );
  assert.equal(calls, 1);
});

Deno.test("guarda falha fechada para erro ou retorno não booleano", async () => {
  await assert.rejects(
    () =>
      shouldSkipTechnicalManualFutureSync({
        rpc: () => Promise.resolve({ data: null, error: new Error("db") }),
      }, "33333333-3333-4333-8333-333333333333"),
    /db/,
  );
  await assert.rejects(
    () =>
      shouldSkipTechnicalManualFutureSync({
        rpc: () => Promise.resolve({ data: null, error: null }),
      }, "33333333-3333-4333-8333-333333333333"),
    /resposta inválida/i,
  );
});
