import assert from "node:assert/strict";
import { getGatewayRuntimeConfig } from "./runtime-config.ts";

const adminWith = (data: unknown) => ({
  from: (table: string) => {
    assert.equal(table, "payment_gateway_runtime_config");
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data, error: null }),
    };
    return query;
  },
});

Deno.test("configuracao canonica ausente falha fechada no sandbox", async () => {
  const runtime = await getGatewayRuntimeConfig(adminWith(null));
  assert.deepEqual(runtime, {
    enabled: false,
    activeEnvironment: "sandbox",
  });
});

Deno.test("configuracao canonica controla status e ambiente", async () => {
  const runtime = await getGatewayRuntimeConfig(adminWith({
    enabled: true,
    active_environment: "production",
  }));
  assert.deepEqual(runtime, {
    enabled: true,
    activeEnvironment: "production",
  });
});
