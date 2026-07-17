import assert from "node:assert/strict";
import {
  allowedBaneseLogoUrl,
  BANESE_DOCUMENT_SECURITY_HEADERS,
  baneseBoletoIssueDate,
  isEligibleBaneseStudentOwner,
  isUniqueEligibleBaneseStudentOwner,
} from "./document-policy.ts";

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
