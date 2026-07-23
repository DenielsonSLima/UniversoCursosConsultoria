import assert from "node:assert/strict";
import {
  assertCnabProductionConfirmation,
  assertReceivableEligibleForCnabRemittance,
  MAX_CNAB_FILE_BYTES,
  normalizeUuidList,
  validateCnabReturnUpload,
} from "./policy.ts";

Deno.test("produção exige confirmação explícita em cada mutação CNAB", () => {
  assert.doesNotThrow(() => assertCnabProductionConfirmation("sandbox", false));
  assert.doesNotThrow(() =>
    assertCnabProductionConfirmation("production", true)
  );
  assert.throws(
    () => assertCnabProductionConfirmation("production", "true"),
    /confirme explicitamente/i,
  );
  assert.throws(
    () => assertCnabProductionConfirmation("production", undefined),
    /confirme explicitamente/i,
  );
});

const eligible = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  status: "PENDENTE",
  gateway_provider: "banese_card",
  gateway_environment: "sandbox",
  gateway_payment_method: "BOLETO",
  gateway_last_error: "Falha segura antes do POST bancário.",
  gateway_status: null,
  gateway_payment_id: null,
  gateway_payment_link_id: null,
  gateway_boleto_issued_at: null,
  gateway_boleto_linha_digitavel: null,
  gateway_boleto_codigo_barras: null,
  gateway_invoice_url: null,
  gateway_bank_slip_url: null,
  gateway_creation_token: null,
  gateway_submission_channel: null,
  gateway_submission_status: null,
  gateway_cnab_file_id: null,
});

Deno.test("aceita somente retorno e limita arquivo a 5 MB", () => {
  assert.deepEqual(
    validateCnabReturnUpload({ fileName: "RETORNO.RET", byteLength: 240 }),
    { fileName: "RETORNO.RET", extension: "ret" },
  );
  assert.throws(
    () =>
      validateCnabReturnUpload({ fileName: "REMESSA.REM", byteLength: 240 }),
    /retorno/i,
  );
  assert.throws(
    () =>
      validateCnabReturnUpload({
        fileName: "retorno.txt",
        byteLength: MAX_CNAB_FILE_BYTES + 1,
      }),
    /5 MB/i,
  );
});

Deno.test("normaliza IDs sem aceitar lote vazio, inválido ou excessivo", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(normalizeUuidList([id, id]), [id]);
  assert.throws(() => normalizeUuidList([]), /entre 1/i);
  assert.throws(() => normalizeUuidList(["inválido"]), /válidas/i);
});

Deno.test("remessa aceita apenas contingência segura ainda não registrada", () => {
  assert.doesNotThrow(() =>
    assertReceivableEligibleForCnabRemittance(eligible(), "sandbox")
  );

  for (
    const changes of [
      { gateway_boleto_issued_at: "2026-07-21T00:00:00Z" },
      { gateway_payment_id: "123456789" },
      { gateway_boleto_linha_digitavel: "1".repeat(47) },
      { gateway_invoice_url: "https://banco.invalid/titulo" },
      { gateway_creation_token: "22222222-2222-4222-8222-222222222222" },
      { gateway_status: "CREATING" },
      { gateway_submission_channel: "CNAB" },
      { gateway_submission_status: "CNAB_GENERATED" },
      { gateway_last_error: null },
    ]
  ) {
    assert.throws(
      () =>
        assertReceivableEligibleForCnabRemittance(
          { ...eligible(), ...changes },
          "sandbox",
        ),
      /API|ambígua|remessa|contingência/i,
    );
  }
});
