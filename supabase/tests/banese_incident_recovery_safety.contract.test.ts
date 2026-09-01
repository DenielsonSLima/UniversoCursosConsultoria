import assert from "node:assert/strict";

const migration = (name: string) =>
  Deno.readTextFile(new URL(`../migrations/${name}`, import.meta.url));

const collision = await migration(
  "20260828093000_enable_banese_collision_preflight_allocation.sql",
);
const recovery = await migration(
  "20260828094000_recover_unlinked_banese_incident_titles.sql",
);

const incidentIds = [
  "08090770-b1d0-4f43-a885-38d3e9859a78",
  "0c5bcdb3-024c-406a-a958-f87260504413",
  "0fe770f0-4bcd-4574-a827-9cf6876e6399",
  "1b47c345-3939-4414-89e5-6ba50fccee91",
  "2bae97e2-cf1c-4153-8da3-6bd9cd41903c",
  "2d5a7b98-ba37-4817-9060-7ab40b6b16d5",
  "38eae118-b430-49a1-8c14-2a99d123d85e",
  "425a9594-cf03-4dd2-a264-fd9ecfc8343f",
  "5c6e5c87-ce71-4185-80af-6c1a0b1e330f",
  "6a9ddb18-d9c7-4b3e-9ed3-c6884d1b4477",
  "87d5ac5d-7796-4627-b3a2-6df97efb6f29",
  "ddf366cf-a365-4a92-81d2-49499203ef32",
  "efe9d997-bf46-4580-83b4-701132d5e815",
];

Deno.test("recuperacao fica restrita aos 13 recebiveis Adenize auditados", () => {
  for (const id of incidentIds) assert.ok(recovery.includes(`'${id}'::uuid`));
  assert.equal(
    [...recovery.matchAll(/'[0-9a-f-]{36}'::uuid/g)].length,
    incidentIds.length,
  );
  assert.match(recovery, /v_targets <> 13/);
  assert.match(recovery, /v_monthly <> 12/);
  assert.match(recovery, /v_reenrollment <> 1/);
});

Deno.test("reserva, claim, finish e avanço exigem ownership por token", () => {
  for (const sql of [collision, recovery]) {
    assert.match(sql, /p_expected_creation_token uuid/);
    assert.match(
      sql,
      /gateway_creation_token = p_expected_creation_token/,
    );
  }
  assert.match(
    collision,
    /advance_banese_nosso_numero_after_collision[\s\S]*p_expected_creation_token uuid/,
  );
  assert.match(
    recovery,
    /claim_banese_incident_recovered_title[\s\S]*p_expected_creation_token uuid/,
  );
  assert.match(
    recovery,
    /finish_banese_incident_recovery_scan[\s\S]*p_expected_creation_token uuid/,
  );
});

Deno.test("CAS bloqueia avanço ou recuperação depois de identidade local", () => {
  for (const sql of [collision, recovery]) {
    assert.match(sql, /gateway_payment_id is null/);
    assert.match(sql, /gateway_boleto_codigo_barras is null/);
    assert.match(sql, /gateway_boleto_linha_digitavel is null/);
    assert.match(sql, /gateway_boleto_issued_at is null/);
    assert.match(sql, /payment_gateway_transactions/);
  }
});
