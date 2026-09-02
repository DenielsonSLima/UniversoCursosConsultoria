import assert from "node:assert/strict";
import { requiresBaneseReconciliation } from "./receivable-issuance.ts";
import { hasUnsafePartialBaneseEvidence } from "./receivable-state.ts";

const ATTEMPT = "22222222-2222-4222-8222-222222222222";

Deno.test("API_AMBIGUOUS da tentativa atual segue somente para conciliação", () => {
  assert.equal(
    requiresBaneseReconciliation({
      status: "PENDENTE",
      gateway_status: "CREATING",
      gateway_creation_token: ATTEMPT,
      gateway_provider: "banese_card",
      gateway_environment: "production",
      gateway_payment_method: "BOLETO",
      gateway_submission_status: "API_AMBIGUOUS",
    }, ATTEMPT),
    true,
  );
});

Deno.test("tentativa ainda pré-remota pode continuar no criador", () => {
  assert.equal(
    requiresBaneseReconciliation({
      status: "PENDENTE",
      gateway_status: "CREATING",
      gateway_creation_token: ATTEMPT,
      gateway_provider: "banese_card",
      gateway_environment: "production",
      gateway_payment_method: "BOLETO",
      gateway_submission_status: null,
    }, ATTEMPT),
    false,
  );
});

Deno.test("API_AMBIGUOUS de outro token fica bloqueado", () => {
  assert.throws(
    () =>
      requiresBaneseReconciliation({
        status: "PENDENTE",
        gateway_status: "CREATING",
        gateway_creation_token: "33333333-3333-4333-8333-333333333333",
        gateway_provider: "banese_card",
        gateway_environment: "production",
        gateway_payment_method: "BOLETO",
        gateway_submission_status: "API_AMBIGUOUS",
      }, ATTEMPT),
    /não pertence à geração atual/i,
  );
});

Deno.test("ramo de retomada ambígua usa GET exato e não chama o criador", async () => {
  const source = await Deno.readTextFile(
    new URL("./receivable-issuance.ts", import.meta.url),
  );
  const recoveryBranch = source.match(
    /if \(recoveryOnly\) \{([\s\S]*?)\n\s*\} else \{/,
  )?.[1] || "";
  assert.match(recoveryBranch, /recoverAmbiguousBaneseResult/);
  assert.doesNotMatch(recoveryBranch, /createGatewayCharge/);
  assert.match(source, /queryBaneseBoleto/);
  assert.match(source, /recoveryMode: "BANESE_EXACT_GET_ONLY"/);
  assert.match(source, /claim_technical_manual_cycle_banese_reconciliation/);
  assert.match(source, /AbortSignal\.timeout\(8_000\)/);
  assert.match(source, /issuerPoloId: input\.scope\.issuerPoloId/);
});

Deno.test("Pix, imagem ou auditoria órfãos bloqueiam o caminho de POST", async () => {
  for (
    const loaded of [
      {
        receivable: { gateway_pix_payload: "pix-oficial" },
        payer: {},
        transactions: [],
      },
      {
        receivable: {
          gateway_pix_encoded_image: "data:image/png;base64,iVBORw0KGgo",
        },
        payer: {},
        transactions: [],
      },
      {
        receivable: {},
        payer: {},
        transactions: [{ id: "auditoria-parcial" }],
      },
      {
        receivable: { gateway_status: "PENDING" },
        payer: {},
        transactions: [],
      },
      {
        receivable: { asaas_payment_id: "pay_anterior" },
        payer: {},
        transactions: [],
      },
    ]
  ) assert.equal(hasUnsafePartialBaneseEvidence(loaded), true);

  assert.equal(
    hasUnsafePartialBaneseEvidence({
      receivable: { gateway_boleto_nosso_numero: "000000015" },
      payer: {},
      transactions: [],
    }),
    false,
  );
  const source = await Deno.readTextFile(
    new URL("./receivable-issuance.ts", import.meta.url),
  );
  const safetyAt = source.indexOf("hasUnsafePartialBaneseEvidence(loaded)");
  const postAt = source.indexOf("result = await createGatewayCharge({");
  assert.ok(safetyAt >= 0 && postAt > safetyAt);
  assert.doesNotMatch(source, /gateway_pix_payload:\s*null/);
  assert.doesNotMatch(source, /gateway_pix_encoded_image:\s*null/);
});

Deno.test("termos canônicos são comprovados antes de chamar o criador", async () => {
  const source = await Deno.readTextFile(
    new URL("./receivable-issuance.ts", import.meta.url),
  );
  const termsAt = source.indexOf(
    "await resolveCanonicalManualCycleBaneseTerms(",
  );
  const postAt = source.indexOf("result = await createGatewayCharge({");
  assert.ok(termsAt >= 0 && postAt > termsAt);
  assert.doesNotMatch(
    source.slice(0, postAt),
    /if \(isStrictlyIssued\([\s\S]*?\)\) return/,
  );
  assert.match(source, /p_retryable_reconciliation: failure\.retryable/);
  assert.match(source, /p_diagnostic_code: failure\.diagnosticCode/);
  assert.match(source, /skipManualCycleFailureMutation\(error\)/);
  assert.match(
    source,
    /persistence\.data\?\.success !== true[\s\S]*?status !== "EMITIDO"/,
  );
});

Deno.test("pagador técnico usa somente a coluna canônica uf", async () => {
  const source = await Deno.readTextFile(
    new URL("./receivable-issuance.ts", import.meta.url),
  );
  const payerSelect = source.match(
    /admin\.from\("parceiros"\)\.select\(\s*"([^"]+)"/,
  )?.[1] || "";
  assert.match(payerSelect, /(?:^|,\s*)uf(?:,|$)/);
  assert.doesNotMatch(payerSelect, /(?:^|,\s*)estado(?:,|$)/);
  assert.match(source, /state:\s*payer\.uf/);
});
