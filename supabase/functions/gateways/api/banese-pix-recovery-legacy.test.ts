import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import { recoverBanesePixBeforeFinancialReconciliation } from "./banese-pix-recovery.ts";

Deno.test("importação legada pendente não persiste QR Pix recuperado", async () => {
  let rpcCalled = false;
  const result = await recoverBanesePixBeforeFinancialReconciliation({
    rpc: async () => {
      rpcCalled = true;
      throw new Error("RPC de Pix não deveria ser chamada");
    },
  }, {
    receivable: {
      gateway_boleto_linha_digitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
      gateway_boleto_codigo_barras: BANESE_DOCUMENT_FIXTURE.barcode,
    },
    environment: "production",
    convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
    nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    snapshot: {
      pixPayload: "pix-retornado-apenas-para-reconsulta-legada",
      pixEncodedImage: "data:image/png;base64,cXItbGVnYWRv",
      raw: {
        NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
        NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
      },
    },
    persistedPixPayload: "",
    persistedPixEncodedImage: "",
    skipLegacyImportedPixPersistence: true,
  });

  assert.equal(rpcCalled, false);
  assert.equal(result.persisted, false);
  assert.equal(result.pixPayload, "");
  assert.equal(result.pixEncodedImage, "");
});
