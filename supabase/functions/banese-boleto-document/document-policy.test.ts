import assert from "node:assert/strict";
import { buildBaneseBoletoPdf } from "../banese/internal/boletos/boleto-pdf.ts";
import { BANESE_DOCUMENT_FIXTURE } from "../banese/internal/testing/document-fixture.ts";
import { normalizeBaneseBoletoDocument } from "../banese/internal/types.ts";
import {
  allowedBaneseLogoUrl,
  BANESE_DOCUMENT_SECURITY_HEADERS,
  baneseBoletoIssueDate,
  isEligibleBaneseStudentOwner,
  isUniqueEligibleBaneseStudentOwner,
} from "./document-policy.ts";

Deno.test("Radiologia importada mantém boleto íntegro em produção sem Pix ou URL externa", async () => {
  const historicalInput = {
    ...BANESE_DOCUMENT_FIXTURE,
    environment: "production" as const,
    instructions: [
      "Mensalidade histórica - Técnico em Radiologia - RAD T-01 INT",
    ],
    pix: null,
  };

  const normalized = normalizeBaneseBoletoDocument(historicalInput);
  assert.equal(normalized.pix, null);
  assert.equal(normalized.ourNumber, BANESE_DOCUMENT_FIXTURE.ourNumber);
  assert.equal(normalized.digitableLine, BANESE_DOCUMENT_FIXTURE.digitableLine);
  assert.equal(normalized.barcode, BANESE_DOCUMENT_FIXTURE.barcode);
  assert.deepEqual(
    normalized.financialTerms,
    {
      ...BANESE_DOCUMENT_FIXTURE.financialTerms,
      discount: {
        ...BANESE_DOCUMENT_FIXTURE.financialTerms?.discount,
        validUntil: BANESE_DOCUMENT_FIXTURE.dueDate,
      },
      interest: {
        ...BANESE_DOCUMENT_FIXTURE.financialTerms?.interest,
        startsOn: "2026-08-16",
      },
      penalty: {
        ...BANESE_DOCUMENT_FIXTURE.financialTerms?.penalty,
        startsOn: "2026-08-16",
      },
    },
  );

  const pdf = await buildBaneseBoletoPdf(historicalInput);
  assert.equal(String.fromCharCode(...pdf.slice(0, 4)), "%PDF");
});

Deno.test("autoriza aluno elegivel dono do boleto", () => {
  const payer = {
    tipo: "Aluno",
    email: "aluno@universo.test",
    status: "ATIVO",
  };
  assert.equal(isEligibleBaneseStudentOwner(payer, "ALUNO@universo.test"), true);
  assert.equal(
    isEligibleBaneseStudentOwner({ ...payer, status: "TRANCADO" }, payer.email),
    true,
  );
  assert.equal(
    isEligibleBaneseStudentOwner({ ...payer, status: "CONCLUIDO" }, payer.email),
    true,
  );
  assert.equal(
    isEligibleBaneseStudentOwner({ ...payer, tipo: "Professor" }, payer.email),
    false,
  );
  assert.equal(
    isEligibleBaneseStudentOwner({ ...payer, status: "INATIVO" }, payer.email),
    false,
  );
  assert.equal(isEligibleBaneseStudentOwner(payer, "outro@universo.test"), false);
});

Deno.test("aluno proprietário precisa ser o único cadastro ativo do e-mail", () => {
  const payer = {
    id: "11111111-1111-4111-8111-111111111111",
    tipo: "Aluno",
    email: "aluno@universo.test",
    status: "ATIVO",
  };
  assert.equal(
    isUniqueEligibleBaneseStudentOwner([payer], payer.id, payer.email),
    true,
  );
  assert.equal(
    isUniqueEligibleBaneseStudentOwner(
      [
        payer,
        { ...payer, id: "22222222-2222-4222-8222-222222222222" },
      ],
      payer.id,
      payer.email,
    ),
    false,
  );
  assert.equal(
    isUniqueEligibleBaneseStudentOwner(
      [{ ...payer, status: "INATIVO" }],
      payer.id,
      payer.email,
    ),
    false,
  );
});

Deno.test("usa exclusivamente o snapshot de emissão bancária", () => {
  assert.equal(baneseBoletoIssueDate("2026-07-17T00:37:54.995Z"), "2026-07-17");
  assert.throws(() => baneseBoletoIssueDate(null), /emissão bancária/i);
  assert.throws(() => baneseBoletoIssueDate("17/07/2026"), /emissão bancária/i);
});

Deno.test("documento sempre desabilita cache compartilhado", () => {
  assert.equal(
    BANESE_DOCUMENT_SECURITY_HEADERS["Cache-Control"],
    "private, no-store, max-age=0",
  );
  assert.equal(BANESE_DOCUMENT_SECURITY_HEADERS["Pragma"], "no-cache");
  assert.equal(
    BANESE_DOCUMENT_SECURITY_HEADERS["X-Content-Type-Options"],
    "nosniff",
  );
});

Deno.test("logo do documento aceita apenas origens e caminhos confiáveis", () => {
  assert.equal(
    allowedBaneseLogoUrl(
      "https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/logos/universo.png",
    ),
    "https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/logos/universo.png",
  );
  assert.equal(
    allowedBaneseLogoUrl(
      "https://universocc.com.br/logos/payment-gateways/banese.png",
    ),
    "https://universocc.com.br/logos/payment-gateways/banese.png",
  );
  assert.equal(allowedBaneseLogoUrl("https://127.0.0.1/logo.png"), null);
  assert.equal(
    allowedBaneseLogoUrl(
      "https://universocc.com.br:8443/logos/payment-gateways/banese.png",
    ),
    null,
  );
  assert.equal(
    allowedBaneseLogoUrl("https://universocc.com.br/admin/internal.png"),
    null,
  );
  assert.equal(
    allowedBaneseLogoUrl(
      "https://usuario@universocc.com.br/logos/payment-gateways/banese.png",
    ),
    null,
  );
  assert.equal(
    allowedBaneseLogoUrl(
      "https://universocc.com.br.evil.test/logos/banese.png",
    ),
    null,
  );
});
