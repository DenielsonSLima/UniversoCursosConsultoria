import assert from "node:assert/strict";
import {
  classifyReissueState,
  hasRecoverablePendingPix,
} from "./ead-title-replacement-state.ts";

const oldOurNumber = "000097299";
const claim = { claimed: true, nossoNumero: oldOurNumber };
const title = (overrides: Record<string, unknown> = {}) => ({
  gateway_boleto_nosso_numero: "000097310",
  gateway_payment_id: "000097310",
  gateway_boleto_linha_digitavel: "1".repeat(47),
  gateway_boleto_codigo_barras: "2".repeat(44),
  gateway_submission_status: "API_REGISTERED",
  gateway_status: "PENDING",
  ...overrides,
});

Deno.test("reissue state recusa Nosso Numero antigo ou ausente", () => {
  assert.deepEqual(
    classifyReissueState(claim, title({
      gateway_boleto_nosso_numero: oldOurNumber,
    })),
    { state: "RESET", nossoNumero: null },
  );
  assert.deepEqual(
    classifyReissueState(claim, title({ gateway_boleto_nosso_numero: null })),
    { state: "RESET", nossoNumero: null },
  );
});

Deno.test("reissue state diferencia reserva, ambiguidade e registro", () => {
  assert.deepEqual(
    classifyReissueState(claim, title({
      gateway_submission_status: "RESERVED",
      gateway_status: "CREATING",
      gateway_payment_id: null,
      gateway_boleto_linha_digitavel: null,
      gateway_boleto_codigo_barras: null,
    })).state,
    "RESERVED",
  );
  assert.deepEqual(
    classifyReissueState(claim, title({
      gateway_submission_status: "API_AMBIGUOUS",
      gateway_payment_id: null,
      gateway_boleto_linha_digitavel: null,
      gateway_boleto_codigo_barras: null,
    })).state,
    "AMBIGUOUS",
  );
  assert.deepEqual(
    classifyReissueState(claim, title({
      gateway_boleto_codigo_barras: null,
    })).state,
    "REGISTERED_INCOMPLETE",
  );
  assert.deepEqual(
    classifyReissueState(claim, title()).state,
    "REGISTERED_COMPLETE",
  );
});

Deno.test("recuperacao Pix exige titulo remoto e local ainda pendentes", () => {
  const receivable = {
    gateway_status: "PENDING",
    gateway_pix_payload: "payload-oficial",
    gateway_pix_encoded_image: "data:image/png;base64,imagem",
  };
  assert.equal(hasRecoverablePendingPix({
    paid: false,
    remoteStatus: "PENDING",
    receivable,
  }), true);
  assert.equal(hasRecoverablePendingPix({
    paid: false,
    remoteStatus: "CANCELED",
    receivable,
  }), false);
  assert.equal(hasRecoverablePendingPix({
    paid: true,
    remoteStatus: "PAID",
    receivable,
  }), false);
});
