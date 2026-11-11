import assert from "node:assert/strict";
import { type IndividualCommand, parseIndividualCommand } from "./contract.ts";
import { createIndividualLedgerAccess } from "./queue-bridge.ts";
import {
  createIndividualHandler,
  type IndividualDependencies,
} from "./handler.ts";
import { reviewedIndividualFixture } from "./adapter.fixture.ts";
const id = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const command: IndividualCommand = {
  scope: {
    contextKey: id(10),
    poloId: id(1),
    environment: "PRODUCAO",
    month: "2026-11",
  },
  action: "PREVIEW_QUEUE",
  requestId: id(50),
  source: { kind: "PARTNER_SERVICE", id: id(40) },
  competenceDate: "2026-11-10",
};
Deno.test("queue intent accepts only an existing prepared source and explicitly scoped competence", () => {
  assert.deepEqual(parseIndividualCommand(command), command);
  const automatic = { ...command };
  delete automatic.competenceDate;
  assert.deepEqual(parseIndividualCommand(automatic), automatic);
  for (
    const extra of [
      { amount: "999.00" },
      { partnerId: id(31) },
      { modelId: id(20) },
      { serviceDate: "2026-11-10" },
      { fiscalInput: {} },
    ]
  ) {
    assert.throws(() => parseIndividualCommand({ ...command, ...extra }));
  }
  assert.throws(() =>
    parseIndividualCommand({ ...command, competenceDate: "2026-02-30" })
  );
  const academic = {
    ...command,
    source: { kind: "ACADEMIC_QUEUE", id: id(41) },
  };
  delete academic.competenceDate;
  assert.equal(parseIndividualCommand(academic).source?.kind, "ACADEMIC_QUEUE");
  assert.throws(() =>
    parseIndividualCommand({ ...academic, competenceDate: "2026-11-10" })
  );
});
Deno.test("queue RPC sends source identity only and never forwards browser amount, recipient or model fields", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const row = reviewedIndividualFixture();
  const access = createIndividualLedgerAccess(async (name, args) => {
    calls.push({ name, args });
    return row;
  });
  await access.ledger(command, id(11), "PREVIEW_QUEUE");
  assert.equal(calls[0].args.p_action, "PREVIEW_QUEUE");
  assert.equal(calls[0].args.p_preview_id, null);
  assert.deepEqual(calls[0].args.p_input, {
    source: { kind: "PARTNER_SERVICE", id: id(40) },
    competenceDate: "2026-11-10",
  });
  assert.equal(
    "amount" in (calls[0].args.p_input as Record<string, unknown>),
    false,
  );
  const automatic = { ...command };
  delete automatic.competenceDate;
  await access.ledger(automatic, id(11), "PREVIEW_QUEUE");
  assert.deepEqual(calls[1].args.p_input, { source: command.source });
});
Deno.test("queue preview and reopening preserve server payload/capability without claiming or executing", async () => {
  const row = reviewedIndividualFixture();
  const calls: string[] = [];
  const unused = async () => {
    throw new Error("EXECUTION_NOT_PERMITTED");
  };
  const deps: IndividualDependencies = {
    authorize: async () => id(11),
    ledger: async (_c, _a, action) => {
      calls.push(action);
      return row;
    },
    cancellation: unused,
    prepare: unused,
    execute: unused,
    prepareCancellation: unused,
    executeCancellation: unused,
    capability: async () => {
      calls.push("CAPABILITY");
      return { available: true, reason: null };
    },
    payload: () => ({ amount: "1.00", nationalServiceCode: "080201" }),
    rateLimited: () => false,
    respond: (_req, body, status) => Response.json(body, { status }),
  };
  const request = (body: unknown) =>
    new Request("https://local.test/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const handler = createIndividualHandler(deps);
  const first = await (await handler(request(command))).json();
  assert.equal(first.data.previewId, row.previewId);
  assert.equal(first.data.capability.available, true);
  assert.deepEqual(calls, ["PREVIEW_QUEUE", "CAPABILITY"]);
  calls.length = 0;
  const reopened = await (await handler(
    request({
      scope: command.scope,
      requestId: command.requestId,
      action: "RECONCILE",
      previewId: row.previewId,
    }),
  )).json();
  assert.equal(reopened.data.expiresAt, row.expiresAt);
  assert.equal(reopened.data.capability.available, true);
  assert.equal(reopened.data.state, "PREVIEWED");
  assert.deepEqual(calls, ["READ", "CAPABILITY"]);
});

Deno.test("reopening an unleased cancellation returns capability and expiry without executing", async () => {
  const row = reviewedIndividualFixture();
  const calls: string[] = [];
  const cancellation = {
    previewId: row.previewId,
    cancelPreviewId: id(91),
    expiresAt: row.expiresAt,
    state: "PREVIEWED",
    dispatch: false,
    accessKey: "0".repeat(50),
    number: "1",
    reasonCode: "1" as const,
    justification: "Erro no valor informado.",
    eventReferenceId: "PRE_PRIVATE",
    occurredAt: row.issuedAt,
    issuerCnpj: "00000000000100",
    eventInput: null,
    signedEventXml: null,
    result: null,
  };
  const unused = async () => {
    throw new Error("EXECUTION_NOT_PERMITTED");
  };
  const deps: IndividualDependencies = {
    authorize: async () => id(11),
    ledger: unused,
    cancellation: async () => {
      calls.push("READ");
      return cancellation;
    },
    prepare: unused,
    execute: unused,
    prepareCancellation: unused,
    executeCancellation: unused,
    capability: async () => {
      calls.push("CAPABILITY");
      return { available: true, reason: null };
    },
    payload: () => ({}),
    rateLimited: () => false,
    respond: (_req, body, status) => Response.json(body, { status }),
  };
  const request = new Request("https://local.test/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope: command.scope,
      action: "RECONCILE_CANCEL",
      requestId: command.requestId,
      previewId: row.previewId,
      cancelPreviewId: id(91),
    }),
  });
  const response = await (await createIndividualHandler(deps)(request)).json();
  assert.equal(response.data.state, "PREVIEWED");
  assert.equal(response.data.expiresAt, row.expiresAt);
  assert.equal(response.data.capability.available, true);
  assert.deepEqual(calls, ["READ", "CAPABILITY"]);
});
