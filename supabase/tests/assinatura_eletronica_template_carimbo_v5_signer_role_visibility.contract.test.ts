// @ts-nocheck -- contrato estático da migration incremental de visibilidade.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260820225028_allow_signature_stamp_signer_role_visibility_v1.sql",
  import.meta.url,
);
const appliedIndividualUrl = new URL(
  "../migrations/20260820010500_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);
const appliedV5Url = new URL(
  "../migrations/20260820113000_add_signature_editor_v5_global_stamp_template.sql",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const appliedIndividual = await Deno.readTextFile(appliedIndividualUrl);
const appliedV5 = await Deno.readTextFile(appliedV5Url);

const sha256 = async (source: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("visibilidade do papel é incremental e não altera migrations aplicadas", async () => {
  assert.match(sql, /^-- .*[\s\S]*?^BEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|ALTER\s+TABLE)\b/iu,
  );
  assert.equal(
    await sha256(appliedIndividual),
    "e63ce27f1d2047b5f61146d8ce3c15870ce62903c52b74ea81d87897a8e0ab0e",
  );
  assert.equal(
    await sha256(appliedV5),
    "38782e7c357a65132a575536f87fd3742507b2f55befee9739d2c2772febb198",
  );
});

Deno.test("validador mantém o template legado e só permite ocultar signerRole", () => {
  const validator = functionBlock(
    "public.assinatura_eletronica_template_carimbo_v5_valido(",
  );

  assert.match(
    validator,
    /'coordinateSpace', 'elements', 'schemaVersion'\s*\]\s*::text\[\]/u,
  );
  assert.match(
    validator,
    /'coordinateSpace', 'elements', 'hiddenElementIds',\s*'schemaVersion'\s*\]\s*::text\[\]/u,
  );
  assert.match(
    validator,
    /p_template -> 'hiddenElementIds'\s+IS NOT DISTINCT FROM '\["signerRole"\]'::jsonb/u,
  );
  assert.doesNotMatch(
    validator,
    /'\["(?:seal|title|signerName|signedAt|signerCpfMasked|signatureHash|verificationCode|verificationUrl|verificationQr|divider)"\]'::jsonb/u,
  );
  assert.match(
    validator,
    /'SIGNATURE_HASH'\s*,\s*'VERIFICATION_CODE'\s*,\s*'VERIFICATION_URL'/u,
  );
  assert.match(
    validator,
    /v_element -> 'style' IS DISTINCT FROM v_expected_styles -> v_index/u,
  );
});

Deno.test("quiet zone e estrutura dos onze bindings continuam fechadas", () => {
  const validator = functionBlock(
    "public.assinatura_eletronica_template_carimbo_v5_valido(",
  );

  assert.match(
    validator,
    /jsonb_array_length\(p_template -> 'elements'\) <> 11/u,
  );
  assert.match(validator, /v_qr := p_template -> 'elements' -> 9/u);
  assert.match(validator, /FOR v_index IN 0\.\.10 LOOP[\s\S]*?v_index <> 9/u);
  assert.doesNotMatch(validator, /v_index = 1/u);
});
