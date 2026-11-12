import assert from "node:assert/strict";
import { createIndividualRuntime } from "./runtime.ts";
import { reviewedIndividualFixture } from "./adapter.fixture.ts";
import type { IndividualCommand } from "./contract.ts";
const command: IndividualCommand = {
  scope: {
    contextKey: "00000000-0000-0000-0000-000000000010",
    poloId: "00000000-0000-0000-0000-000000000001",
    environment: "PRODUCAO",
    month: "2026-11",
  },
  action: "PREVIEW",
  requestId: "00000000-0000-0000-0000-000000000050",
  partnerId: "00000000-0000-0000-0000-000000000030",
  modelId: "00000000-0000-0000-0000-000000000020",
  modelVersion: 1,
  amount: "1.00",
  competenceDate: "2026-11-10",
  serviceDate: "2026-11-10",
};
const actor = "00000000-0000-0000-0000-000000000011";
Deno.test("runtime sends browser intent only to the canonical SQL preview and preserves null identifiers", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const row = reviewedIndividualFixture();
  const runtime = createIndividualRuntime({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: row, error: null };
    },
    authorize: async () => actor,
    respond: (_req, body, status) => Response.json(body, { status }),
    rateLimited: () => false,
  });
  try {
    await runtime.dependencies.ledger(command, actor, "PREVIEW");
    assert.equal(calls[0].name, "nfse_individual_operation_internal");
    assert.equal(calls[0].args.p_preview_id, null);
    assert.deepEqual(calls[0].args.p_input, {
      partnerId: command.partnerId,
      modelId: command.modelId,
      modelVersion: 1,
      amount: "1.00",
      competenceDate: "2026-11-10",
      serviceDate: "2026-11-10",
    });
    assert.equal(
      "fiscalInput" in (calls[0].args.p_input as Record<string, unknown>),
      false,
    );
  } finally {
    runtime.close();
  }
});
Deno.test("runtime reports a fiscal review reason without reading any A1 or opening transport for a basic model", async () => {
  const row = reviewedIndividualFixture();
  delete (row.snapshot.model as { definition: Record<string, unknown> })
    .definition.serviceOptions;
  let calls = 0;
  const runtime = createIndividualRuntime({
    rpc: async () => {
      calls++;
      throw new Error("SENTINEL");
    },
    authorize: async () => actor,
    respond: (_req, body, status) => Response.json(body, { status }),
    rateLimited: () => false,
  });
  try {
    assert.deepEqual(
      await runtime.dependencies.capability(command, actor, row),
      { available: false, reason: "FISCAL_SERVICE_LOCATION_REVIEW_REQUIRED" },
    );
    assert.equal(calls, 0);
  } finally {
    runtime.close();
  }
});
Deno.test("runtime resolves address municipality using a unique official city+UF match and rejects ambiguity", async () => {
  const row = reviewedIndividualFixture();
  (row.snapshot.model as {
    definition: { peopleOptions: Record<string, unknown> };
  }).definition.peopleOptions.recipientAddressSource = "FROM_PARTNER";
  let ambiguous = false;
  const calls: string[] = [];
  const runtime = () =>
    createIndividualRuntime({
      rpc: async (name, args) => {
        calls.push(name);
        if (name === "buscar_municipios_ibge") {
          assert.equal(args.p_busca, "JAPOATÃ SE");
          assert.equal(args.p_limite, 30);
          const items = [{ nome: "Japoatã", uf: "SE", codigo_ibge: 2803401 }];
          return {
            data: ambiguous ? [...items, ...items] : items,
            error: null,
          };
        }
        return { data: null, error: { message: "PRIVATE_KEY_SENTINEL" } };
      },
      authorize: async () => actor,
      respond: (_req, body, status) => Response.json(body, { status }),
      rateLimited: () => false,
    });
  const first = runtime();
  try {
    const result = await first.dependencies.capability(command, actor, row);
    assert.equal(result.reason, "PRODUCTION_CREDENTIAL_UNAVAILABLE");
    assert.deepEqual(calls, [
      "buscar_municipios_ibge",
      "get_nfse_production_material_internal",
    ]);
  } finally {
    first.close();
  }
  ambiguous = true;
  calls.length = 0;
  const second = runtime();
  try {
    const result = await second.dependencies.capability(command, actor, row);
    assert.equal(result.reason, "FISCAL_RECIPIENT_MUNICIPALITY_UNRESOLVED");
    assert.deepEqual(calls, ["buscar_municipios_ibge"]);
    assert.equal(JSON.stringify(result).includes("SENTINEL"), false);
  } finally {
    second.close();
  }
});

Deno.test('runtime maps SQL permission failure without leaking SQL or changing actor identity', async () => {
  let seen: Record<string, unknown> | undefined;
  const runtime = createIndividualRuntime({
    rpc: async (_name, args) => { seen = args; return { data: null, error: { code: '42501', message: 'PRIVATE_DETAIL' } }; },
    authorize: async () => actor, respond: (_r, body, status) => Response.json(body, { status }), rateLimited: () => false,
  });
  try {
    await assert.rejects(runtime.dependencies.ledger(command, actor, 'READ'), (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'INDIVIDUAL_OPERATION_SCOPE_DENIED' && !error.message.includes('PRIVATE'));
    assert.equal(seen?.p_actor_id, actor);
    assert.equal(seen?.p_context_key, command.scope.contextKey);
  } finally { runtime.close(); }
});
