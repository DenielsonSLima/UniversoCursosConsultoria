import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EAD_AMBIGUOUS_RECOVERY_TARGETS,
  handledEadAmbiguousRecovery,
  recoverEadAmbiguousTitlesOnce,
} from "./ead-ambiguous-recovery.ts";

const FIRST_ID = "f47cbf46-fe94-4c81-b845-dd7a265c7734";
const CLAIM_TOKEN = "77777777-7777-4777-8777-777777777777";

const adminWith = (responses: Array<{ data: unknown; error: unknown }>) => ({
  calls: [] as Array<[string, Record<string, unknown> | undefined]>,
  async rpc(name: string, params?: Record<string, unknown>) {
    this.calls.push([name, params]);
    return responses.shift() ?? { data: null, error: null };
  },
});

Deno.test("lote fechado reconcilia cada claim uma única vez por GET", async () => {
  const admin = adminWith([
    {
      data: {
        receivableId: FIRST_ID,
        nossoNumero: EAD_AMBIGUOUS_RECOVERY_TARGETS[FIRST_ID],
        claimToken: CLAIM_TOKEN,
      },
      error: null,
    },
    { data: true, error: null },
    { data: null, error: null },
  ]);
  const reconciled: string[] = [];
  const report = await recoverEadAmbiguousTitlesOnce(
    admin,
    async (_client, receivableId) => {
      reconciled.push(receivableId);
    },
  );

  assert.deepEqual(reconciled, [FIRST_ID]);
  assert.deepEqual(report, {
    claimed: 1,
    done: 1,
    failedFinal: 0,
    finalizedWithoutGet: 0,
  });
  assert.equal(handledEadAmbiguousRecovery(report), true);
  assert.equal(
    admin.calls.filter(([name]) =>
      name === "complete_banese_ead_ambiguous_recovery_target"
    ).length,
    1,
  );
});

Deno.test("falha de consulta termina sem segunda tentativa automática", async () => {
  const admin = adminWith([
    {
      data: {
        receivableId: FIRST_ID,
        nossoNumero: EAD_AMBIGUOUS_RECOVERY_TARGETS[FIRST_ID],
        claimToken: CLAIM_TOKEN,
      },
      error: null,
    },
    { data: false, error: null },
    { data: null, error: null },
  ]);
  let attempts = 0;
  const report = await recoverEadAmbiguousTitlesOnce(admin, async () => {
    attempts += 1;
    throw new Error("retorno remoto omitido");
  });

  assert.equal(attempts, 1);
  assert.equal(report.failedFinal, 1);
  assert.deepEqual(admin.calls[1][1], {
    p_receivable_id: FIRST_ID,
    p_claim_token: CLAIM_TOKEN,
    p_success: false,
    p_failure_code: "GET_RECONCILIATION_FAILED",
  });
});

Deno.test("claim fora da allowlist falha antes da consulta", async () => {
  const admin = adminWith([{
    data: {
      receivableId: "11111111-1111-4111-8111-111111111111",
      nossoNumero: "000097299",
      claimToken: CLAIM_TOKEN,
    },
    error: null,
  }]);
  let reconciled = false;
  await assert.rejects(
    () =>
      recoverEadAmbiguousTitlesOnce(admin, async () => {
        reconciled = true;
      }),
    /TARGET_REJECTED/,
  );
  assert.equal(reconciled, false);
});

Deno.test("implementação one-shot não possui caminho de emissão", async () => {
  const source = await readFile(
    new URL("./ead-ambiguous-recovery.ts", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("createGatewayCharge"), false);
  assert.equal(source.includes('method: "POST"'), false);
  assert.equal(Object.keys(EAD_AMBIGUOUS_RECOVERY_TARGETS).length, 2);
  const workerSource = await readFile(
    new URL("./index.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    workerSource,
    /recoverEadAmbiguousTitlesOnce\(\s*admin,\s*reconcileBaneseReceivable/s,
  );
});

Deno.test("migration usa claim serializado, uma tentativa e quarentena final", async () => {
  const sql = await readFile(
    new URL(
      "../../migrations/20260831182500_reconcile_ead_ambiguous_banese_once.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /attempts between 0 and 1/i);
  assert.match(sql, /claim_token uuid/i);
  assert.match(sql, /claimed_at <= v_now - interval '5 minutes'/i);
  assert.match(sql, /p_claim_token uuid/i);
  assert.match(sql, /state = 'QUARANTINED'/i);
  assert.match(sql, /gateway_submission_status = 'API_AMBIGUOUS'/i);
  assert.match(
    sql,
    /transaction\.remote_payment_id = v_target\.expected_nosso_numero/i,
  );
  assert.match(
    sql,
    /not exists \(\s*select 1 from public\.payment_gateway_transactions/is,
  );
});
